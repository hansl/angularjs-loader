console.log('Loading shim.');

window.setTimeout(function() {
    console.log('Setting the shim.');
    window['theShim'] = true;
}, 100);