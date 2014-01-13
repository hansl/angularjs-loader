'use strict';

/**
 */
(function() {

// Get our script tag.
var allScriptTags = document.getElementsByTagName('script');
var angularJsLoaderScriptTag = allScriptTags[allScriptTags.length - 1];

var mainModulePathArg = getAttribute('app');
var rootPathArg = getAttribute('root', '');
var timeoutArg = getAttribute('timeout', 30000);

var angularModuleOriginalFn = angular.module;
var bootstrapLockCount = 0;
var loadedModuleMap = {};

function pathFromModuleName(name) {
    if (name.search(/^(https?:)?\/\/.+/) == 0) {
        return name;
    }
    var path = name.replace('.', '/') + '.js';

    if (rootPathArg) {
        path = rootPathArg + '/' + path;
    }

    return path;
}

function insertScript(path) {
    var newScriptTag = document.createElement('script');
    newScriptTag.type = "text/javascript";
    newScriptTag.src = path;
    document.head.appendChild(newScriptTag);
}

function maybeBootstrap() {
    // Wait until the current Javascript code is entirely loaded before
    // checking the bootstrap lock.
    if (--bootstrapLockCount == 0) {
        window.setTimeout(function() {
            // We check again in case the file introduced new dependencies.
            if (bootstrapLockCount == 0) {
                angular.bootstrap(document, [mainModulePathArg]);
            }
        }, 0);
    }
}

function getAttribute(name, defaultValue) {
    if (angularJsLoaderScriptTag.attributes[name]) {
        return angularJsLoaderScriptTag.attributes[name].value;
    }
    else if (typeof defaultValue == 'undefined') {
        throw new Error('Need to specify an "' + name
                      + '" attribute to angularjs-script.');
    }
}

angular.extend(angular, {
    requires: function(path, checkerFn) {
        path = pathFromModuleName(path);
        if (loadedModuleMap[path]) {
            return angular;
        }

        loadedModuleMap[path] = true;
        insertScript(path);
        if (checkerFn) {
            // We can specify either a function to be called, a string
            // representing the name of an object or an array of strings.
            if (typeof checkerFn !== 'function') {
                var variable = checkerFn;
                if (!(variable instanceof Array)) {
                    variable = [variable];
                }
                checkerFn = function() {
                    for (var i = 0; i < variable.length; i++) {
                        if (typeof window[variable] == 'undefined') {
                            return false;
                        }
                    }
                    return true;
                }
            }

            bootstrapLockCount++;
            var start = +new Date();
            var interval = window.setInterval(function() {
                if (checkerFn()) {
                    maybeBootstrap();
                    // For every interval created we will clear it by design.
                    window.clearInterval(interval);
                }
                else if (new Date() - start >= timeoutArg) {
                    throw new Error('Timed out loading "' + path + '".');
                }
            });
        }
        return angular;
    },
    module: function() {
        var requires = arguments[1];

        if (requires instanceof Array) {
            for (var i = 0; i < requires.length; i++) {
                var path = pathFromModuleName(requires[i]);
                if (loadedModuleMap[path]) {
                    continue;
                }

                loadedModuleMap[path] = true;
                insertScript(path);

                // We do it here because the call above might throw.
                bootstrapLockCount++;
            }
        }

        var ret = angularModuleOriginalFn.apply(angular, arguments);
        maybeBootstrap();  // If we're done, bootstrap angular.
        return ret;
    }
});


// Load the first module.
bootstrapLockCount++;
insertScript(pathFromModuleName(mainModulePathArg));

})();