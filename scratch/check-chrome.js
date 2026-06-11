async function checkChrome() {
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version');
    const data = await res.json();
    console.log('✅ Chrome Debugger is active!');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Chrome Debugger is NOT active on port 9222:', err.message);
  }
}

checkChrome();
