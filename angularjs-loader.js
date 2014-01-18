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
                        fn && fn(value);
                    }
                    else {
                        errFn && errFn(reason);
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


var lockCount = 0;
var isBootstrapped = false;
var locks = {};

function locked(name) {
    return name in locks;
}

function lock(name) {
    if (name in locks) {
        throw new Error('Path "' + name + '" is being loaded twice.')
        return false;
    }
    locks[name] = false;
    lockCount++;
}

function unlock(name) {
    if (!(name in locks)) {
        throw new Error('Path "' + name + '" was not loaded.');        
    }
    if (locks[name]) {
        throw new Error('Path "' + name + '" was loaded twice.');
    }
    locks[name] = true;

    if (--lockCount == 0) {
        if (isBootstrapped) {
            throw new Error('App already bootstrapped.');
        }

        isBootstrapped = true;

        window.setTimeout(function() {
            // We check again in case the file introduced new dependencies.
            angular.bootstrap(document, [mainModulePathArg]);
        }, 0);
    }
}

function insertScript(path) {
    var d = deferred();

    lock('script:' + path);
    d.promise.then(function() {
        unlock('script:' + path);
    });

    var newScriptTag = document.createElement('script');
    newScriptTag.type = "text/javascript";
    newScriptTag.src = path;

    newScriptTag.addEventListener('load', function(ev) { d.resolve(ev); });
    newScriptTag.addEventListener('error', function(ev) { d.reject(ev); });
    document.head.appendChild(newScriptTag);

    return d.promise;
}

function getAttribute(name, defaultValue) {
    if (angularJsLoaderScriptTag.attributes[name]) {
        return angularJsLoaderScriptTag.attributes[name].value;
    }
    else if (typeof defaultValue == 'undefined') {
        throw new Error('Need to specify an "' + name
                      + '" attribute to angularjs-loader.');
    }
    return defaultValue;
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

    var checkerFn = options.checker || function() { return true; };
    var checkerMap = {};

    if (typeof checkerFn == 'object') {
        checkerMap = checkerFn;
    }
    else {
        for (var i = 0; i < path.length; i++) {
            checkerMap[path[i]] = checkerFn;
        }
    }

    // Replace all the values in checkerMap by a function. If it's already
    // do nothing. If it's a string or an array adhere to the documentation.
    for (var script in checkerMap) {
        var fn = checkerMap[script];
        if (typeof fn == 'function') {
            continue;
        }

        if (typeof fn == 'string') {
            fn = [fn];
        }

        checkerMap[script] = function() {
            for (var i = 0; i < fn.length; i++) {
                if (typeof window[fn[i]] == 'undefined') {
                    return false;
                }
            }
            return true;
        };
    }

    var timeout = options.timeout || timeoutArg;

    function unlockOnChecker(name, lock) {
        if (!(name in checkerMap)) {
            unlock(lock);
            return;
        }
        else {
            var start = +new Date();
            var interval = window.setInterval(function() {
                if (checkerMap[name](name)) {
                    // For every interval created we will clear it by design.
                    window.clearInterval(interval);
                    unlock(lock);
                }
                else if (new Date() - start >= timeout) {
                    window.clearInterval(interval);
                    throw new Error('Timed out loading "' + path + '".');
                }
            }, 10);
        }
    }

    function recursiveLoader(d) {
        if (path.length) {
            var name = path.shift();
            var p = pathFromModuleName(name);
            if (!p || locked(p)) {
                return recursiveLoader(d);
            }

            lock(p);
            d = insertScript(p).then(function() {
                recursiveLoader(d);
                unlockOnChecker(name, p);
            }, function(reason) {
                throw new Error(reason);
            });
        }
        else {
            if (!d) {
                returnDefer.resolve();
                return;
            }

            d.then(function(val) {
                returnDefer.resolve(val);
            }, function(val) {
                returnDefer.reject(val);
            });
        }
    }

    if (isSequence) {
        recursiveLoader();
    }
    else {
        var counter = 0;
        while (path.length > 0) {
            var name = path.shift();
            var p = pathFromModuleName(name);
            if (!p || locked(p)) {
                continue;
            }

            counter++;
            lock(p);
            insertScript(p).then(function(val) {
                if (--counter) returnDefer.resolve(val);
                unlockOnChecker(name, p);
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
    requires: function(name, checkerFn) {
        if (typeof name == 'object') {
            for (var n in name) {
                angular.requires(n, name[n]);
            }
        }
        else {
            angular.loader(name, {
                checker: checkerFn
            });
        }

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
                if (!path || locked(requires[i])) {
                    continue;
                }

                lock(requires[i]);
                insertScript(path);
            }
        }

        var path = pathFromModuleName(name);
        if (path) {
            unlock(name);
        }
        return ret;
    }
});


// Load the first module.
lock(mainModulePathArg);
angular.loader(mainModulePathArg);

})();