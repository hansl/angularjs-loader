#!/usr/bin/env node

/**
 * Script that takes files using angularjs-loader and concatenate them in order
 * of dependencies.
 * A lot of functionalities are reproduced from angularjs-loader. Mostly options
 * and path configuration.
 */

var allDependencies = {};
var root = '';
var stack = [];

/**
 * The configuration we need for AngularJS-Loader.
 * The config _can_ change as we load dependencies. But if a dependency
 * conflicts, it will result in an error.
 */
var config = {
    path: {},
    pathTransform: [],
    checker: {}  // Technically not used.
};

/**
 * Utility functions.
 */
function noop() {};
function chainNoop() { return this; }

function extend(orig, extension, override) {
    if (override === void 0)
        override = true;

    for (var name in extension) {
        if (override || !(name in orig)) {
            orig[name] = extension[name];
        }
    }
    return orig;
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
    var path = name in map ? map[name] : transformPath(name, config.pathTransform);

    if (path === null) {
        return path;
    }

    // If the path is a URI, just return it.
    if (path.search(/^(https?:)?\/\/.+/) == 0) {
        return path;
    }

    // Prepend the root path if not absolute.
    path = ((root && path[0] != '/') ? root + '/' : '') + path;

    // If the path doesn't end in .js, add that.
    if (path.search(/\.js$/) == -1) {
        path += '.js';
    }

    return path;
}

function loadDependency(list) {
    var stackLength = stack.length;

    if (stackLength > 0) {
        var top = stack[stack.length - 1];
        allDependencies[top].deps = allDependencies[top].deps.concat(list);
    }

    for (var i = 0; i < list.length; i++) {
        var name = list[i];
        var path = pathFromModuleName(name);
        stack.push(path);

        if (!(path in allDependencies)) {
            allDependencies[path] = {
                deps: [],
                name: name,
                isRoot: false,
                path: path
            }
        }

        if (path !== null) {
            require(path);
        }

        var x = stack.pop();
        if (x != path) {
            throw 'Value popped should have been the same as value pushed.';
        }
    }

    if (stackLength != stack.length) {
        throw 'Stack was changed during a dependency loading.';
    }
};


// Dummy Window object just so the script doesn't cause any problems.
window = this;

angular = {
    module: function(name, opt_deps /*, ...*/) {
        angular.loader(opt_deps);
        // A dummy module.
        return {
            config: chainNoop,
            run: chainNoop,
            controller: chainNoop,
            directive: chainNoop
        }
    },
    loader: function(path, options) {
        if (typeof path === 'string') {
            path = [path];
        }

        loadDependency(path);

        // Fake promises.
        return {
            then: function(fn) {
                fn();
            }
        }
    }
}

angular.loader.config = function(cfg, newConcatConfig) {
    extend(config.path, cfg.path, false);
    extend(config.checker, cfg.checker, false);
    config.pathTransform = config.pathTransform.concat(cfg.pathTransform);

    if (newConcatConfig) {
        extend(config.checker, newConcatConfig.checker);
        extend(config.path, newConcatConfig.path);
        config.pathTransform = config.pathTransform.concat(newConcatConfig.pathTransform);
    }

    return {
        then: function(fn) {
            console.log(fn);
        }
    }
}

function main() {
    var args = process.argv.splice(2);

    for (var i = 0; i < args.length; i++) {
        var path = args[i];
        var pathArray = path.split('/');
        var file = pathArray.pop();
        root = pathArray.join('/');

        loadDependency([root + '/' + file]);
    }

    console.log(allDependencies);
}

try { main() } catch(e) {}
console.log(allDependencies);
