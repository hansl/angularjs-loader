#!/usr/bin/env node

/**
 * Script that takes files using angularjs-loader and concatenate them in order
 * of dependencies.
 */

// We load angularjs-loader for being able to re-use most of its code.
window = {
    __angularjs_loader_noinit: true
};
require('./angularjs-loader');

var angularJsLoader = {};
for (var name in window) {
    angularJsLoader[name.replace(/^angularjs_loader_?/, '')] = window[name];
}
angular = window.angular;


var allDependencies = {};
var absoluteDependencies = [];
var root = '';
var stack = [];
var config = extend(angularJsLoader.config, {
    shouldRecurse: {},
    modules: []
});

var priority = 0;

// /**
//  * Utility functions.
//  */
// function noop() {};
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



function loadDependency(list, shouldRequire) {
    var stackLength = stack.length;
    var top;

    if (stackLength > 0) {
        top = stack[stack.length - 1];
    }

    for (var i = 0; i < list.length; i++) {
        var name = list[i];

        var path = angularJsLoader.pathFromModuleName(name, top && allDependencies[top].path);
        if (path === null) {
            continue;
        }
        var isAbsolute = path.search(/^(https?:)?\/\/.+/) == 0;

        if (isAbsolute) {
            if (absoluteDependencies.indexOf(path) == -1) {
                absoluteDependencies.push(path);
            }
            continue;
        }

        if (top && allDependencies[top].deps.indexOf(name) == -1) {
            allDependencies[top].deps.push(name);
        }
        if (!(name in allDependencies)) {
            allDependencies[name] = {
                deps: [],
                name: name,
                isRoot: false,
                path: isAbsolute ? path : root + '/' + path,
                priority: priority++
            }
        }
        else {
            // Already loaded.
            continue;
        }

        stack.push(name);

        shouldRequire = shouldRequire || config.shouldRecurse[name];

        if (path !== null && shouldRequire && !isAbsolute) {
            try {
                require(root + '/' + path);
            }
            catch (e) {
                console.error(e);
            }
        }

        var x = stack.pop();
        if (x != name) {
            throw 'Value popped should have been the same as value pushed.';
        }
    }

    if (stackLength != stack.length) {
        throw 'Stack was changed during a dependency loading.';
    }
};

function solveDependencies() {
    var ordered = [];
    // Make a copy.
    var deps = extend({}, allDependencies);
    var circular = false;

    while (true) {
        while (circular == false) {
            circular = true;

            for (var name in deps) {
                var d = deps[name];

                if (d.deps.length == 0) {
                    // We have a winner.
                    ordered.push(name);
                    delete deps[name];
                    circular = false;

                    // Delete it from dependencies. It's been revolved now.
                    for (var dname in deps) {
                        if (deps[dname].deps.indexOf(name) != -1) {
                            deps[dname].deps.splice(deps[dname].deps.indexOf(name), 1);
                        }
                    }
                }
            }
        }

        // Check for circular dependencies.
        var lowestPriority = Infinity;
        var lowestName = null;

        // We have a circular dependency.
        for (var name in deps) {
            if (deps[name].priority < lowestPriority) {
                lowestPriority = deps[name].priority;
                lowestName = name;
            }
        }

        if (lowestName === null) {
            break;  // Done!
        }

        // We have a winner.
        ordered.push(lowestName);
        delete deps[lowestName];
        circular = false;

        // Delete it from dependencies. It's been revolved now.
        for (var dname in deps) {
            if (deps[dname].deps.indexOf(lowestName) != -1) {
                deps[dname].deps.splice(deps[dname].deps.indexOf(lowestName), 1);
            }
        }
    }

    return ordered;
}


angular.module = function(name, opt_deps /*, ...*/) {
    if (opt_deps) {
        loadDependency(opt_deps, true);
    }

    // A dummy module.
    return {
        config: chainNoop,
        run: chainNoop,
        controller: chainNoop,
        directive: chainNoop,
        factory: chainNoop,
        filter: chainNoop
    }
};
angular.loader = function(path, options) {
    if (typeof path === 'string') {
        path = [path];
    }

    loadDependency(path, false);

    // Fake promises.
    return {
        then: function(fn) {
            try {
                fn();
            }
            catch (ex) {
                // Do Nothing with it.
            }
        }
    }
}
angular.loader.config = function(cfg, additionalConfig) {
    extend(config.path, cfg.path, false);
    extend(config.checker, cfg.checker, false);
    config.pathTransform = config.pathTransform.concat(cfg.pathTransform);

    if (additionalConfig) {
        extend(config.path, additionalConfig.path, true);
        extend(config.checker, additionalConfig.checker, true);
        config.shouldRecurse = additionalConfig.shouldRecurse;
        config.pathTransform = config.pathTransform.concat(additionalConfig.pathTransform || []);
        config.modules = config.modules.concat(additionalConfig.modules || []);
    }

    return {
        then: function(fn) {
            console.error(fn);
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

        loadDependency([root + '/' + file], true);
    }

    // Now go through all of them, and build an order of inclusion.
    // This will reveal circular dependencies. We resolve them by having
    // a priority associated with the dependency. The lower the priority,
    // the better the order of inclusion.

    var orderedDependencies = solveDependencies();
    var fs = require('fs');

    // Output a useless loader that should be optimized out.
    console.log(
          "/** AngularJS Loader Script */"
        + "window.angular = window.angular || {};\n"
        + "window.angular.loader = function() { return {then: function(fn) { window.setTimeout(fn, 0)}}};\n"
        + "window.angular.loader.config = function() {};\n"
        + "function __angularjs_insertScript(path) {\n"
        + "    var newScriptTag = document.createElement('script');\n"
        + "    newScriptTag.type = 'text/javascript';\n"
        + "    newScriptTag.src = path;\n"
        + "\n"
        + "    newScriptTag.addEventListener('load', function(ev) {\n"
        // + "        d.resolve(caller);\n"
        + "    });\n"
        + "    newScriptTag.addEventListener('error', function(ev) {\n"
        + "        error(12, [path], 'Error while loading the script: {0}.');\n"
        + "    });\n"
        + "    document.head.appendChild(newScriptTag);\n"
        + "};\n"
        + "\n"
    );

    for (var i = 0; i < absoluteDependencies.length; i++) {
        console.log('__angularjs_insertScript("' + absoluteDependencies[i] + '");\n');
    }

    for (var i = 0; i < orderedDependencies.length; i++) {
        var src = allDependencies[orderedDependencies[i]].path;
        var data = fs.readFileSync(src, 'utf-8');
        console.log(data);
    }

    // Output the bootstrapping code, since we don't rely on the loader.
    console.log(
        'window.setTimeout(function() { angular.bootstrap(document, ["'
            + config.modules.join('","') + '"]); }, 0);'
    );
}

main();

// console.log(allDependencies);
