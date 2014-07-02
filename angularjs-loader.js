/* Copyright (C) 2013 Hans Larsen */
'use strict';

/**
 * Used for exporting additional functions for unit testing. Should not be used
 * otherwise.
 * @define {boolean}
 */
var ANGULARJS_LOADER_TESTING = true;

/**
 * Better error messages.
 * @define {boolean}
 */
var ANGULARJS_LOADER_DEBUG = true;


/**
 * AngularJS Loader.
 * Automatically load scripts based on angular.module() calls (ala AMD).
 *******************************************************************************
 * In my experience this is faster than RequireJS in our case (around 60 scripts
 * both including utility functions and angular modules). The end page loads
 * many more scripts in parallels, reducing application bootstrap time noticably
 * in Chrome and Safari.
 *******************************************************************************
 * Documentation: see http://github.com/hansl/angularjs-loader
 *
 * Error IDs:
 *   1 - Deferred resolved twice.
 *   2 - Path "{0}" is being loaded twice.
 *   3 - Path "{0}" was not loaded.
 *   4 - Path "{0}" was loaded twice.
 *   5 - App already bootstrapped.
 *   6 - Need to initialize before loading.
 *   7 - Timed out checking module named "{0}" at "{1}".
 *   8 - NOT USED.
 *   9 - Angular was not loaded.
 *  10 - The "app" argument is mandatory.
 *  11 - Script did not load in time.
 *  12 - Error while loading the script: {0}.
 *  NextId: 13
 */
(function(window, UNDEFINED) {

/**
 * These constants are just easier to shorten and reuse when using a
 * minificator.
 */
var NULL = null;

/**
 * Config parameters passed in angular.loader.config().
 * @type Config
 */
var config = {
    error: NULL,
    path: {},
    checker: {},
    pathTransform: []
};

var initialized = false;

var mainModulePathArg;
var rootPathArg;
var timeoutArg;
var bootstrapFnArg;

var angularModuleOriginalFn = window.angular && window.angular.module;

/*******************************************************************************
 * Some polyfills.
 */
// Returns true if the value is of type type.
function isOfType(value, type) {
    return typeof value == type;
}
// Returns true if the value is a string.
function isString(value) {
    return isOfType(value, 'string');
}
// Returns true if the value is an object.
function isObject(value) {
    return isOfType(value, 'object');
}
// Extend an object. See jQuery.extend() for "some" documentation.
function extend(orig, extension, override) {
    if (override === UNDEFINED)
        override = true;

    for (var name in extension) {
        if (override || !(name in orig)) {
            orig[name] = extension[name];
        }
    }
    return orig;
}
// Bind a function to an object and a list of arguments.
function bind(fn, o) {
    var args = new Array(arguments.length);
    for(var i = 0; i < args.length; ++i) {
        args[i] = arguments[i];
    }
    return function() {
        return fn.apply(o, args.slice(2).concat(arguments));
    };
}


/*******************************************************************************
 * Error function. If a handler is specified it will be called with the ID and
 * params. Otherwise this will either throw or log an error on the console.
 * Optimized, the message will disappear.
 */
function error(id, params, msg) {
    if (config.error) {
        config.error(id, params);
    }
    else if (ANGULARJS_LOADER_DEBUG) {
        var message = msg.replace(/\{(\d+)\}/g, function(_, i) {
            return params[i];
        });
        throw new Error(message);
    }
    else {
        // Maybe an error handler would be useful here.
        console.error('err', id, params);
    }
}


/*******************************************************************************
 * A really simple promise object.
 * We do not want any external dependencies, so this object makes it easy for
 * us to be able to do promises (which are great) without having another script
 * loaded before us.
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
                error(1, [], 'Deferred resolved twice.');
            }
            value = val;
            for (var i = 0; i < success.length; i++) {
                success[i](val);
            }
            succeeded = true;
            pending = false;
            return deferred;
        },
        promise: {
            then: function(fn) {
                if (!pending) {
                    if (succeeded) {
                        fn && fn(value);
                    }
                }
                else {
                    if (fn) {
                        success.push(fn);
                    }
                }
                return deferred.promise;
            }
        }
    };

    return deferred;
}

/**
 * Transform a path according to a transformer list.
 */
function transformPath(path, transformList) {
    var original = path;
    for (var i = 0, fn; fn = transformList[i]; i++) {
        var old = path;
        path = fn(path, original);
        if (path === NULL) {
            return old;
        }
    }
    return path;
}

function pathOfCurrentFile() {
    var getErrorSource = function(error) {
        var loc;
        var replacer = function(stack, matchedLoc) {
            loc = matchedLoc;
        };

        if ('fileName' in error) {
            return error.fileName;
        } else if ('stacktrace' in error) { // Opera
            error.stacktrace.replace(/Line \d+ of .+ script (.*)/gm, replacer);
        } else if ('stack' in error) { // WebKit
            error.stack.replace(/(?:at |@)(.*)/gm, replacer);
            loc = loc.replace(/:\d+:\d+$/, '');
        }
        return loc;
    };

    try {
        0();
    }
    catch (error) {
        var source = getErrorSource(error);
        return source;
    }
}

function pathFromModuleName(name, parent) {
    var map = config.path;

    if (map[name] === NULL) return NULL;

    var path;

    // If the name is a URI, just return it.
    if (name.search(/^(https?:)?\/\/.+/) == 0) {
        path = name;
    }
    else if (name.search(/^\.\/+/) == 0) {
        path = (parent || pathOfCurrentFile()).match(/^(.+\/).+?$/)[1] + name;
    }
    else {
        path = name in map ? map[name] : transformPath(name, config.pathTransform);
        // Prepend the root path if not absolute.
        path = ((rootPathArg && path[0] != '/') ? rootPathArg + '/' : '') + path;
    }

    // If the path doesn't end in .js, add that.
    if (path.search(/\.js$/) == -1) {
        path += '.js';
    }

    return path;
}

/*******************************************************************************
 * Locking module.
 */
var lockCount = 0;
var isBootstrapped = false;
var locks = {};

function locked(name) {
    return name in locks;
}

function lock(name) {
    if (name in locks) {
        error(2, [name], 'Path "{0}" is being loaded twice.');
    }
    locks[name] = false;
    lockCount++;
}

function unlock(name) {
    if (!(name in locks)) {
        error(3, [name], 'Path "{0}" was not loaded.');
    }
    if (locks[name]) {
        error(4, [name], 'Path "{0}" was loaded twice.');
    }
    locks[name] = true;

    if (--lockCount == 0) {
        if (isBootstrapped) {
            error(5, [], 'App already bootstrapped.');
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

function insertScript(path, attr, caller) {
    var d = deferred();

    var newScriptTag = document.createElement('script');
    newScriptTag.type = 'text/javascript';
    newScriptTag.src = path;

    for (var name in attr) {
        var value = attr[name];
        newScriptTag.attributes[name] = value;
    }

    newScriptTag.addEventListener('load', function(ev) {
        d.resolve(caller);
    });
    newScriptTag.addEventListener('error', function(ev) {
        error(12, [path], 'Error while loading the script: {0}.');
    });
    window.setTimeout(function() {
        if (d.pending()) {
            error(11, [], 'Script did not load in time.');
        }
    }, timeoutArg);
    document.head.appendChild(newScriptTag);

    return d.promise;
}

function maybeSwapAngularModuleFn() {
    // We set angular.module prior, in case angular was loaded manually in
    // the page.
    if ('angular' in window && angular.module && !angularModuleOriginalFn) {
        angularModuleOriginalFn = angular.module;
        angular.module = newAngularModuleFn;
    }
}

function loaderFn(path, options) {
    if (!initialized) {
        error(6, [], 'Need to initialize before loading.')
    }
    if (options === UNDEFINED) {
        options = {};
    }
    if (isString(path)) {
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

    if (isObject(checkerFn)) {
        checkerMap = checkerFn;
    }
    else {
        for (var i = 0; i < path.length; i++) {
            checkerMap[path[i]] = checkerFn;
        }
    }

    extend(checkerMap, config.checker);

    // Replace all the values in checkerMap by a function. If it's already
    // do nothing. If it's a string or an array adhere to the documentation.
    for (var script in checkerMap) {
        var fn = checkerMap[script];
        if (typeof fn == 'function') {
            continue;
        }

        if (isString(fn)) {
            fn = [fn];
        }

        checkerMap[script] = (function(checks) {
            return function() {
                for (var i = 0; i < checks.length; i++) {
                    if (window[checks[i]] === UNDEFINED) {
                        return false;
                    }
                }
                return true;
            }
        })(fn);
    }

    var timeout = options.timeout || timeoutArg;

    // Allow us to specify that a module will be declared in the loading of these
    // scripts.
    var modules = options.modules;
    if (modules) {
        for (var i = 0; i < modules.length; i++) {
            if (!locked(modules[i])) {
                lock(modules[i]);
            }
        }
    }

    function unlockOnChecker(name, path) {
        if (!(name in checkerMap)) {
            unlock(path);
            return;
        }
        else {
            if (checkerMap[name](name)) {
                unlock(path);
                return;
            }

            var start = +new Date();
            var interval = window.setInterval(function() {
                if (checkerMap[name](name)) {
                    // For every interval created we will clear it by design.
                    window.clearInterval(interval);
                    unlock(path);
                }
                else if (new Date() - start >= timeout) {
                    window.clearInterval(interval);
                    error(7, [name, path],
                          'Timed out checking module named "{0}" at "{1}".');
                }
            }, 10);
        }
    }

    var parent = pathOfCurrentFile();

    function recursiveLoader(d) {
        if (path.length) {
            var name = path.shift();
            var obj = isObject(name) ? name : {src: name};
            var p = pathFromModuleName(obj.src, parent);
            if (!p || locked(p)) {
                return recursiveLoader(d, parent);
            }

            lock(p);
            d = insertScript(p, obj, parent).then(function(parent) {
                recursiveLoader(d);
                unlockOnChecker(name, p);
            });
        }
        else {
            if (!d) {
                returnDefer.resolve();
                return;
            }

            d.then(function(val) {
                returnDefer.resolve(val);
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
            var obj = isObject(name) ? name : { name: name };
            var p = pathFromModuleName(obj.name);
            if (!p || locked(p)) {
                continue;
            }

            counter++;
            lock(p);

            var successFn = function(name, p, val) {
                if ((--counter) == 0) returnDefer.resolve(val);
                unlockOnChecker(name, p);
            };

            insertScript(p, obj).then(bind(successFn, 0, name, p));
        }
        if (counter == 0) {
            returnDefer.resolve(true);
        }
    }

    if (!angularModuleOriginalFn) {
        // If a script (angular itself) set angular.module function, we
        // override it properly.
        returnDefer.promise.then(maybeSwapAngularModuleFn);
    }
    return returnDefer.promise;
}

function newAngularModuleFn() {
    var name = arguments[0];
    var requires = arguments[1];
    if (!angularModuleOriginalFn) {
        error(9, [], 'Angular was not loaded.');
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
            insertScript(path, pathFromModuleName(name));
        }
    }

    var path = pathFromModuleName(name);
    if (path) {
        unlock(name);
    }
    return ret;
}

extend(loaderFn, {
    config: function angularLoaderConfig(cfg) {
        if (cfg) {
            extend(config.checker, cfg.checker, false);
            extend(config.path, cfg.path, false);
            config.pathTransform = config.pathTransform.concat(cfg.pathTransform);
            if ('error' in cfg) {
                config.error = cfg.error;
            }
        }
        return loaderFn;
    },
    init: function angularLoaderInit(options) {
        mainModulePathArg = options.app;
        rootPathArg = options.root || '';
        timeoutArg = options.timeout || 30000;
        bootstrapFnArg = options.bootstrapFn;
        if (isString(bootstrapFnArg)) {
            var fnCode = bootstrapFnArg;
            bootstrapFnArg = function() {
                eval(fnCode);
            };
        }
        extend(config, options.config || {});

        if (!mainModulePathArg) {
            error(10, [], 'The "app" argument is mandatory.')
        }

        maybeSwapAngularModuleFn();
        lock(mainModulePathArg);

        initialized = true;
        if (options.boot) {
            window.angular.loader(mainModulePathArg);
        }
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
        if (isObject(name)) {
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

// Different initialization when under unittest.
if (ANGULARJS_LOADER_TESTING) {
    var resetOnlyVisibleForTesting = function() {
        lockCount = 0;
        isBootstrapped = false;
        locks = {};
        mainModulePathArg = NULL;
        rootPathArg = NULL;
        timeoutArg = NULL;
        bootstrapFnArg = NULL;
        angularModuleOriginalFn = NULL;

        maybeSwapAngularModuleFn();
    }

    extend(window, {
        'angularjs_loader': window.angular.loader,
        'angularjs_loader_lock': lock,
        'angularjs_loader_unlock': unlock,
        'angularjs_loader_locked': locked,
        'angularjs_loader_extend': extend,  // I realize the irony.
        'angularjs_loader_insertScript': insertScript,
        'angularjs_loader_reset': resetOnlyVisibleForTesting,
        'angularjs_loader_pathFromModuleName': pathFromModuleName,
        'angularjs_loader_config': config,
        'angularjs_loader_error': error
    });
}

if (window && window['__angularjs_loader_noinit'] !== true) {
    // Get our script tag.
    var allScriptTags = document.getElementsByTagName('script');
    var angularJsLoaderScriptTag = (function() {
        for (var i = 0; i < allScriptTags.length; i++) {
            if (/angularjs-loader\.js([?#].+)?$/.test(allScriptTags[i].src)) {
                return allScriptTags[i];
            }
        }
        return NULL;
    })();

    // Shortcut for getting the value from the tag.
    var getScriptTagAttr = function(name, defaultValue) {
        return angularJsLoaderScriptTag.getAttribute(name, defaultValue);
    }

    if (!getScriptTagAttr('noinit', false)) {
        angular.loader.init({
            app: getScriptTagAttr('app', NULL),
            bootstrapFn: getScriptTagAttr('onbootstrap', ''),
            root: getScriptTagAttr('root', ''),
            timeout: getScriptTagAttr('timeout', 30000),
            boot: true
        });
    }
}

})(window);
