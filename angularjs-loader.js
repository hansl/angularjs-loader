/* Copyright (C) 2013 Hans Larsen */
'use strict';

/**
 * AngularJS Loader.
 * Automatically load scripts based on angular.module() calls (ala AMD).
 *******************************************************************************
 * In my experience this is faster than RequireJS in our case (around 60 scripts
 * both including utility functions and angular modules).
 *******************************************************************************
 * Documentation: see http://github.com/hansl/angularjs-loader
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

var isBootstrapped = false;

var config = {};

var defaultTransformPathList = [
    function isAbsoluteUrl(path) {
        return path.search(/^(https?:)?\/\/.+/) == 0 ? null : path;
    },
    function prependRootPath(path) {
        return (rootPathArg ? rootPathArg + '/' : '') + path;
    },
    function appendJsExtension(path) {
        return path.search(/\.js$/) == -1 ? path + '.js' : path;
    }
];

function getConfig(name, defaultValue) {
    if (name in config) {
        return config[name];
    }
    else {
        return defaultValue;
    }
}

/**
 * A really simple promise object.
 */
function deferred() {
    var success = [];
    var error = [];
    var pending = true;
    var value;
    var reason;

    var deferred = {
        resolve: function(val) {
            value = val;
            for (var i = 0; i < success.length; i++) {
                success[i](val);
            }
            pending = false;
        },
        reject: function(val) {
            reason = val;
            for (var i = 0; i < error.length; i++) {
                error[i](val);
            }
            pending = false;
        },
        promise: {
            then: function(fn, errFn) {
                if (!pending) {
                    if (value) {
                        fn(value);
                    }
                    else {
                        errFn(reason);
                    }
                }
                else {
                    if (fn) {
                        success.push(fn);
                    }
                    if (errFn) {
                        error.push(errFn);
                    }
                }
                return deferred.promise;
            },
            error: function(fn) {
                return deferred.then(null, fn);
            }
        }
    };

    return deferred;
}

function transformPath(path, transformList) {
    var original = path;
    for (var i = 0, fn; fn = transformList[i]; i++) {
        var old = path;
        path = fn(path, original);
        if (path === null) {
            return old;
        }
    }
    return path;
}

function pathFromModuleName(name) {
    var map = getConfig('path', {});
    if (map[name] === null) return null;

    var transformList = getConfig('pathTransform', [])
                                .concat(defaultTransformPathList);
    var path = transformPath(name in map ? map[name] : name, transformList);

    return path;
}

function insertScript(path) {
    var d = deferred();
    var newScriptTag = document.createElement('script');
    newScriptTag.type = "text/javascript";
    newScriptTag.src = path;

    newScriptTag.addEventListener('load', function(ev) { d.resolve(ev); });
    newScriptTag.addEventListener('error', function(ev) { d.reject(ev); });
    document.head.appendChild(newScriptTag);

    return d.promise;
}

function maybeBootstrap(path) {
    if (!(path in loadedModuleMap)) {
        throw new Error('Path "' + path + '" was not loaded.');
    }
    else if (loadedModuleMap[path]) {
        throw new Error('Path "' + path + '" was loaded twice.');
    }

    loadedModuleMap[path] = true;
    // Wait until the current Javascript code is entirely loaded before
    // checking the bootstrap lock.
    if (--bootstrapLockCount == 0) {
        if (isBootstrapped) {
            throw new Error('App already bootstrapped.');
        }
        isBootstrapped = true;

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
                      + '" attribute to angularjs-loader.');
    }
}

function loaderFn(path, options) {
    // Backward compatibility with the old (pre 0.3.0) loader.
    if (typeof options !== 'object') {
        return loaderFn(path, {
            sequence: true
        }).then(options);
    }

    if (typeof path == 'string') {
        path = [path];
    }

    var isSequence = options.sequence || false;
    var returnDefer = deferred();
    if (path.length == 0) {
        returnDefer.resolve();
        return returnDefer;
    }

    function recursiveLoader(d) {
        if (path.length) {
            var p = pathFromModuleName(path.shift());
            if (!p || p in loadedModuleMap) {
                return recursiveLoader(d);
            }

            d.then(function() {
                recursiveLoader(insertScript(p));
            }, function(val) {
                returnDefer.reject(val);
            });
        }
        else {
            d.then(function(val) {
                returnDefer.resolve(val);
            }, function(val) {
                returnDefer.reject(val);
            });
        }
    }

    if (isSequence) {
        var p = pathFromModuleName(path.shift());
        recursiveLoader(insertScript(p));
    }
    else {
        var counter = 0;
        while (path.length > 0) {
            counter++;

            var p = pathFromModuleName(path.shift());
            if (!p || p in loadedModuleMap) {
                continue;
            }

            recursiveLoader(insertScript(p));
            insertScript(p).then(function(val) {
                if (--counter) returnDefer.resolve(val);
            }, function(err) {
                returnDefer.reject(err);
            });
        }
    }

    return returnDefer.promise;
}

angular.extend(loaderFn, {
    config: function(cfg) {
        angular.extend(config, cfg);
        return loaderFn;
    }
});

angular.extend(angular, {
    loader: loaderFn,
    requires: function(path, checkerFn) {
        if (typeof path == 'object') {
            for (var name in path) {
                angular.requires(name, path[name]);
            }
            return angular;
        }
        path = pathFromModuleName(path);
        if (!path || path in loadedModuleMap) {
            return angular;
        }


        if (checkerFn) {
            // We can specify either a function to be called, a string
            // representing the name of an object or an array of strings.
            if (typeof checkerFn != 'function') {
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
        }

        if (typeof checkerFn == 'null' || checkerFn()) {
            return angular;
        }
        loadedModuleMap[path] = false;
        insertScript(path);
        bootstrapLockCount++;

        var start = +new Date();
        var interval = window.setInterval(function() {
            if (checkerFn()) {
                maybeBootstrap(path);
                // For every interval created we will clear it by design.
                window.clearInterval(interval);
            }
            else if (new Date() - start >= timeoutArg) {
                throw new Error('Timed out loading "' + path + '".');
            }
        });
        return angular;
    },
    module: function() {
        var name = arguments[0];
        var requires = arguments[1];
        var ret = angularModuleOriginalFn.apply(angular, arguments);

        // If module() was called with only 1 argument, it was to get the module
        // and not create a new one.
        if (arguments.length == 1) {
            return ret;
        }

        if (requires instanceof Array) {
            for (var i = 0; i < requires.length; i++) {
                var path = pathFromModuleName(requires[i]);
                if (!path || path in loadedModuleMap) {
                    continue;
                }

                loadedModuleMap[path] = false;
                insertScript(path);

                // We do it here because the call above might throw.
                bootstrapLockCount++;
            }
        }

        var path = pathFromModuleName(name);
        if (path) {
            maybeBootstrap(path);  // If we're done, bootstrap angular.
        }
        return ret;
    }
});


// Load the first module.
bootstrapLockCount++;
var mainModulePath = pathFromModuleName(mainModulePathArg);
loadedModuleMap[mainModulePath] = false;
insertScript(mainModulePath);

})();