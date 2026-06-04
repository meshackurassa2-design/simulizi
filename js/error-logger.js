window.addEventListener('error', function(e) {
    document.body.innerHTML += `<div style="padding:20px; color:red; background:white; position:fixed; z-index:9999; top:0; left:0; right:0;">
        <h3>Window Error</h3>
        <p>${e.message}</p>
        <p>${e.filename}:${e.lineno}</p>
    </div>`;
});
