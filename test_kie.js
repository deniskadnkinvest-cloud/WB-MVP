const fetch = require('node-fetch'); // If node 18+, fetch is built-in

const apiKey = process.env.KIE_API_KEY || process.env.GEMINI_API_KEY || 'test';
// I need the actual API key. The app uses process.env.KIE_API_KEY. I can use dotenv to load it.
require('dotenv').config({ path: './.env.local' });
require('dotenv').config({ path: './.env' });

const realApiKey = process.env.KIE_API_KEY || process.env.GEMINI_API_KEY;

if (!realApiKey) {
    console.error('No API key found in .env');
    process.exit(1);
}

const reqBody = {
    model: 'nano-banana-2',
    input: {
        prompt: 'A simple white cube on a black background',
        aspect_ratio: '1:1',
        resolution: '1K',
        output_format: 'png'
    }
};

(async () => {
    console.log('Creating task...');
    const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${realApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(reqBody)
    });
    const data = await res.json();
    console.log('Create response:', data);
    
    if (!data.data || !data.data.taskId) {
        console.error('No task id');
        return;
    }
    const taskId = data.data.taskId;
    
    for (let i=0; i<10; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const poll = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${realApiKey}` }
        });
        const pollData = await poll.json();
        console.log(`Poll ${i+1}:`, JSON.stringify(pollData, null, 2));
        if (pollData?.data?.state === 'success' || pollData?.data?.state === 1 || pollData?.data?.state === 'SUCCESS' || pollData?.data?.state === 'failed') {
            break;
        }
    }
})();
