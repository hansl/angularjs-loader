'use strict';

/**
 */
(function() {

var original_module = angular.module;
var nb_calls = 0;
var root = '';
var app_module = null;

function pathFromModuleName(name) {
    if (name.search(/^(https?:)?\/\/.+/) == 0) {
        return name;
    }
    var path = name.replace('.', '/') + '.js';

    if (root) {
        path = root + '/' + path;
    }

    return path;
}

function insertScript(path) {
    var script_tag = document.createElement('script');
    script_tag.type = "text/javascript";
    script_tag.src = path;
    document.head.appendChild(script_tag);
}

function maybeBootstrap() {
    if (--nb_calls == 0) {
        window.setTimeout(function() {
            angular.bootstrap(document, [app_module]);
        }, 0);
    }
}

angular.extend(angular, {
    requires: function(path, checkerFn) {
        insertScript(pathFromModuleName(path));
        if (checkerFn) {
            nb_calls++;
            window.setInterval(function() {
                if (checkerFn()) {
                    maybeBootstrap();
                }
            });
        }
        return angular;
    },
    module: function(var_args) {
        var name = arguments[0];
        var requires = arguments[1];
        var configFn = arguments[2];

        if (requires instanceof Array) {
            for (var i = 0; i < requires.length; i++) {
                insertScript(pathFromModuleName(requires[i]));

                // We do it here because the call above might throw.
                nb_calls++;
            }
        }

        var return_value = original_module.apply(angular, arguments);
        maybeBootstrap();
        return return_value;
    }
});


// Get our script tag.
var all_scripts = document.getElementsByTagName('script');
var my_script = all_scripts[all_scripts.length - 1];

// Load the first module.
nb_calls++;
app_module = my_script.attributes['app'].value;
if (my_script.attributes['root']) {
    root = my_script.attributes['root'].value;
}
document.write('<script type="text/javascript" src="' + pathFromModuleName(app_module) + '"></script>');

})();