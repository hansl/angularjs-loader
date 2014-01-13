'use strict';

/**
 */
(function() {

// Get our script tag.
var all_scripts = document.getElementsByTagName('script');
var my_script = all_scripts[all_scripts.length - 1];

var arg_main_module = getAttribute('app');
var arg_path_root = getAttribute('root', '');
var arg_timeout = getAttribute('timeout', 30000);

var original_module = angular.module;
var nb_calls = 0;
var loaded_modules = {};

function pathFromModuleName(name) {
    if (name.search(/^(https?:)?\/\/.+/) == 0) {
        return name;
    }
    var path = name.replace('.', '/') + '.js';

    if (arg_path_root) {
        path = arg_path_root + '/' + path;
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
            angular.bootstrap(document, [arg_main_module]);
        }, 0);
    }
}

function getAttribute(name, defaultValue) {
    if (my_script.attributes[name]) {
        return my_script.attributes[name].value;
    }
    else if (typeof defaultValue == 'undefined') {
        throw new Error('Need to specify an "' + name + '" attribute to angularjs-script.');
    }
}

angular.extend(angular, {
    requires: function(path, checkerFn) {
        path = pathFromModuleName(path);
        if (loaded_modules[path]) {
            return angular;
        }

        loaded_modules[path] = true;
        insertScript(path);
        if (checkerFn) {
            nb_calls++;
            var start = +new Date();
            var interval = window.setInterval(function() {
                if (checkerFn()) {
                    maybeBootstrap();
                    window.clearInterval(interval);
                }
                else if (new Date() - start >= arg_timeout) {
                    throw new Error('Timed out loading "' + path + '".');
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
                var path = pathFromModuleName(requires[i]);
                if (loaded_modules[path]) {
                    continue;
                }

                loaded_modules[path] = true;
                insertScript(path);

                // We do it here because the call above might throw.
                nb_calls++;
            }
        }

        var return_value = original_module.apply(angular, arguments);
        maybeBootstrap();  // If we're done, bootstrap angular.
        return return_value;
    }
});


// Load the first module.
nb_calls++;
insertScript(pathFromModuleName(arg_main_module));

})();