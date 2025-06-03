// api/openai-proxy.js
// 將此文件放在 Vercel 項目的 api 文件夾中

export default async function handler(req, res) {
  // 設置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { action, threadId, message, assistantId } = req.body;
  
  // 使用環境變數中的 OpenAI API 金鑰
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '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';

  try {
    switch (action) {
      case 'createThread':
        console.log('創建新線程...');
        const threadResponse = await fetch('https://api.openai.com/v1/threads', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          }
        });
        
        if (!threadResponse.ok) {
          const errorData = await threadResponse.json();
          console.error('OpenAI 創建線程錯誤:', errorData);
          return res.status(threadResponse.status).json({ 
            error: '創建線程失敗', 
            details: errorData 
          });
        }
        
        const thread = await threadResponse.json();
        console.log('線程創建成功:', thread.id);
        res.json(thread);
        break;

      case 'sendMessage':
        console.log('處理訊息:', message);
        
        // 添加訊息到線程
        const messageResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          },
          body: JSON.stringify({
            role: 'user',
            content: message
          })
        });

        if (!messageResponse.ok) {
          const errorData = await messageResponse.json();
          console.error('添加訊息錯誤:', errorData);
          return res.status(messageResponse.status).json({ 
            error: '添加訊息失敗', 
            details: errorData 
          });
        }

        // 運行 Assistant
        console.log('啟動 Assistant...');
        const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          },
          body: JSON.stringify({
            assistant_id: assistantId
          })
        });

        if (!runResponse.ok) {
          const errorData = await runResponse.json();
          console.error('啟動 Assistant 錯誤:', errorData);
          return res.status(runResponse.status).json({ 
            error: '啟動 Assistant 失敗', 
            details: errorData 
          });
        }

        const run = await runResponse.json();
        console.log('Assistant 運行 ID:', run.id);

        // 等待運行完成
        let runStatus = run.status;
        let attempts = 0;
        const maxAttempts = 30; // 最多等待30秒

        while ((runStatus === 'queued' || runStatus === 'in_progress') && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
          
          const statusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${run.id}`, {
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'OpenAI-Beta': 'assistants=v2'
            }
          });
          
          if (!statusResponse.ok) {
            console.error('檢查狀態失敗');
            return res.status(500).json({ error: '檢查運行狀態失敗' });
          }
          
          const statusData = await statusResponse.json();
          runStatus = statusData.status;
          console.log(`Assistant 狀態 (${attempts}/${maxAttempts}):`, runStatus);
          
          if (runStatus === 'failed' || runStatus === 'cancelled' || runStatus === 'expired') {
            console.error('Assistant 運行失敗:', statusData);
            return res.status(500).json({ 
              error: `Assistant 運行失敗: ${runStatus}`, 
              details: statusData 
            });
          }
        }

        if (runStatus !== 'completed') {
          console.error('Assistant 運行超時:', runStatus);
          return res.status(408).json({ 
            error: `Assistant 運行超時，狀態: ${runStatus}` 
          });
        }

        // 獲取回覆
        console.log('獲取回覆...');
        const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v2'
          }
        });

        if (!messagesResponse.ok) {
          console.error('獲取訊息失敗');
          return res.status(500).json({ error: '獲取訊息失敗' });
        }

        const messages = await messagesResponse.json();
        const lastMessage = messages.data[0];
        const responseText = lastMessage.content[0].text.value;
        
        console.log('回覆成功');
        res.json({
          response: responseText
        });
        break;

      default:
        res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('OpenAI API Error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
}
