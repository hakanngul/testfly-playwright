export const LOGIN_HTML = `<!doctype html><html><head><title>Login</title>
<style>#sub{display:none} #nav:hover #sub, #nav:focus-within #sub{display:block}</style></head><body>
<h1>Welcome</h1>
<label for="email">Email</label><input id="email" type="text">
<label for="pw">Password</label><input id="pw" type="password">
<button id="go" onclick="document.getElementById('out').textContent='signed-in:'+document.getElementById('email').value+':'+document.getElementById('pw').value">Sign in</button>
<div id="nav"><a href="#products">Products</a><div id="sub"><a href="#laptops" onclick="document.getElementById('out').textContent='laptops'">Laptops</a></div></div>
<p id="out">idle</p>
</body></html>`;
