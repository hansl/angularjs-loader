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
var config = {
    path: {},
    checker: {},
    pathTransform: []
};

var mainModulePathArg;
var rootPathArg;
var timeoutArg;
var bootstrapFnArg;

var angularModuleOriginalFn = window.angular && window.angular.module;

function getConfig(name, defaultValue) {
    if (name in config) {
        return config[name];
    }
    else {
        return defaultValue;
    }
}

function extend(orig, extension, override) {
    if (typeof override == 'undefined')
        override = true;

    for (var name in extension) {
        if (override || !(name in orig)) {
            orig[name] = extension[name];
        }
    }
    return orig;
}

/**
 * A really simple promise object.
 */
function deferred() {
    var success = [];
    var error = [];
    var pending = true;
    var succeeded;
    var value;
    var reason;

    var deferred = {
        pending: function() {
            return pending;
        },
        resolve: function(val) {
            if (!pending) {
                throw new Error('Deferred resolved twice.');
            }
            value = val;
            for (var i = 0; i < success.length; i++) {
                success[i](val);
            }
            succeeded = true;
            pending = false;
            return deferred;
        },
        reject: function(val) {
            reason = val;
            for (var i = 0; i < error.length; i++) {
                error[i](val);
            }
            pending = false;
            succeeded = false;
            return deferred;
        },
        promise: {
            then: function(fn, errFn) {
                if (!pending) {
                    if (succeeded) {
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
    var map = config.path;

    if (map[name] === null) return null;

    var transformList = config.pathTransform;
    var path = name in map ? map[name] : transformPath(name, transformList);

    // If the path is a URI, just return it.
    if (path.search(/^(https?:)?\/\/.+/) == 0) {
        return path;
    }

    // Prepend the root path if not absolute.
    path = ((rootPathArg && path[0] != '/') ? rootPathArg + '/' : '') + path;

    // If the path doesn't end in .js, add that.
    if (path.search(/\.js$/) == -1) {
        path += '.js';
    }

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
        throw new Error('Path "' + name + '" is being loaded twice.');
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
            if (bootstrapFnArg) {
                bootstrapFnArg();
            }
        }, 0);
    }
}

function insertScript(path) {
    var d = deferred();

    var newScriptTag = document.createElement('script');
    newScriptTag.type = "text/javascript";
    newScriptTag.src = path;

    newScriptTag.addEventListener('load', function(ev) { d.resolve(ev); });
    newScriptTag.addEventListener('error', function(ev) { d.reject(ev); });
    window.setTimeout(function() {
        if (d.pending()) {
            d.reject(new Error('Script did not load in time.'));
        }
    }, timeoutArg);
    document.head.appendChild(newScriptTag);

    return d.promise;
}

function loaderFn(path, options) {
    if (options === undefined) {
        options = {};
    }
    if (typeof path == 'string') {
        path = [path];
    }

    var isSequence = options.sequence || false;
    var returnDefer = deferred();
    if (path.length == 0) {
        returnDefer.resolve();
        return returnDefer.promise;
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

    extend(checkerMap, getConfig('checker', {}));

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

    // Allow us to specify that a module will be declared in the loading of these
    // scripts.
    var modules = options.modules;
    if (modules) {
        for (var i = 0; i < modules.length; i++) {
            lock(modules[i]);
        }
    }

    function unlockOnChecker(name, lock) {
        if (!(name in checkerMap)) {
            unlock(lock);
            return;
        }
        else {
            if (checkerMap[name](name)) {
                unlock(lock);
                return;
            }

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

            var successFn = function(name, p, val) {
                if ((--counter) == 0) returnDefer.resolve(val);
                unlockOnChecker(name, p);
            };

            insertScript(p).then(successFn.bind(0, name, p), function(err) {
                returnDefer.reject(err);
            });
        }
        if (counter == 0) {
            returnDefer.resolve(true);
        }
    }

    if (!angularModuleOriginalFn) {
        // If a script (angular itself) set angular.module function, we
        // override it properly.
        returnDefer.promise.then(function() {
            if (angular.module && !angularModuleOriginalFn) {
                angularModuleOriginalFn = angular.module;
                angular.module = newAngularModuleFn;
            }
        });
    }
    return returnDefer.promise;
}

function newAngularModuleFn() {
    var name = arguments[0];
    var requires = arguments[1];
    if (!angularModuleOriginalFn) {
        throw new Error('Angular was not loaded.');
    }

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

extend(loaderFn, {
    config: function(cfg) {
        extend(config.checker, cfg.checker, false);
        extend(config.path, cfg.path, false);
        config.pathTransform = config.pathTransform.concat(cfg.pathTransform);
        return loaderFn;
    },
    init: function(options) {
        mainModulePathArg = options.app;
        rootPathArg = options.root || '';
        timeoutArg = options.timeout || 30000;
        bootstrapFnArg = options.bootstrapFn;
        extend(config, options.config || {});

        if (!mainModulePathArg) {
            throw new Error('The "app" argument is mandatory.')
        }

        lock(mainModulePathArg);
    },
    lock: function(name) {
        lock('ext:' + name);
    },
    unlock: function(name) {
        unlock('ext:' + name);
    }
});

extend(window.angular || (window.angular = {}), {
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
    }
});

// Get our script tag.
var allScriptTags = document.getElementsByTagName('script');
var angularJsLoaderScriptTag = (function() {
    for (var i = 0; i < allScriptTags.length; i++) {
        if (/angularjs-loader\.js$/.test(allScriptTags[i].src)) {
            return allScriptTags[i];
        }
    }
    return null;
})();

if (!angularJsLoaderScriptTag.getAttribute('noinit', false)) {
    angular.loader.init({
        app: angularJsLoaderScriptTag.getAttribute('app'),
        root: angularJsLoaderScriptTag.getAttribute('root', ''),
        timeout: angularJsLoaderScriptTag.getAttribute('timeout', 30000)
    });
    angular.loader(mainModulePathArg);
}

})();