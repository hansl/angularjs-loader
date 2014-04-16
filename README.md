# angularjs-loader

[![Build Status](https://travis-ci.org/hansl/angularjs-loader.png)](https://travis-ci.org/hansl/angularjs-loader)

A script loader for AngularJS that perform AMD-like script injection without the need for special syntax.






# Rationale

Say you are like me and love having a Javascript file for every module. And you have a lot of scripts with specific tasks; directives, factories, utility functions. You name it.

One solution that we used here at Coders at Work was RequireJS, but I grew tired of it; it is becoming too heavy and doesn't integrate that well with AngularJS.






# Example

So I decided to go ahead and build this little script. Here's how it works:

> File `index.html`:
>
> ```html
>      <html>
>        <head>
>             <script type="text/javascript" src="path/to/angular.js"></script>
>             <script type="text/javascript" src="path/to/angularjs-loader.js" app="test_app"></script>
>         </head>
>         
>         <body>
>             <div ng-controller="TestCtrl as test">
>                 {{test.value}}
>             </div>
>         </body>
>     </html>
> ```
> -----
>
> File `test_app.js`:
>
> ```javascript
>     angular.module('test_app', ['test_ctrl']);
> ```
> -----
>
> File `test_ctrl.js`:
>
> ```javascript
>     angular.module('test_ctrl', []).controller('TestCtrl', function() {
>         this.value = 'Hello World!';
>     });
> ```

Angularjs-loader automatically sees that angular.module() has a dependency to 'test_ctrl', and loads the script automatically when it's ready. When all `angular.module()` calls are done, it automatically bootstrap angular.

As long as you stick to AngularJS, there's no need for shims, paths or configurations. A blocking module makes it simple to include other libraries as well.






# API

## Script tag.

The script tag for loading this script needs to be inserted after AngularJS, but before the document is ready.

It takes 3 arguments:

* `app`. The main module to load. This is the name of the first script to load.
* `root`. A root to prepend to every path (except absolute paths). By default, no path is prepended.
* `timeout`. A timeout for loading scripts, in milliseconds. If a script hasn't fired an `onload` event, an error will be thrown. By default, 30 seconds.
* `onbootstrap`. Code to evaluate when the Angular is finished loading.
* `noinit`. Any non-empty string to prevent the AngularJS-Loader from automatically starting the initialization process. See [Tests](#Tests).



## Angular Modules

The loader overrides `angular.module()` and does two things:

1. When creating a new module, it takes the list of module dependencies and load the Javascript associated with it (using \<script\> tags).

2. It then uses an atomic lock for bootstrapping and will unlock once the module is created. When all locks are unlocked, it bootstrap AngularJS by calling `angular.bootstrap(document)`.

As you use `angular.module()` to create a module, it will load its dependencies recursively. Using `angular.module()` to only access the module itself is okay and has no side effect.



## Custom Scripts

When you need to load custom scripts you should use the new function `angular.loader()`. It takes 2 arguments and returns a simplified promise object.

The first argument is either a filename or an array of filename to load. Remember that these will be transformed using the [path transform](#Configuration).

The second argument is an object of named options:

* `sequence`. Set to `true` to have files loaded in a sequence instead of all at once. Loader will wait for each file to be loaded (`onload` event) before starting the next one.
* `checker`.  A function, a string representing a variable name or an hash map of ScriptName to function or string.  
The `function` is called at regular intervals after the script is loaded and only if it returns `true` will the script considered fully loaded (releasing the lock on bootstrapping Angular).  
If a `string` is specified, it checks for that variable name in `window` and will unlock the bootstrapping when it exists.  
If a `hash map` is specified, it will take each scripts and check them using the either the `function` or the `string` value in the same manner as above.  
Omitting this option performs no checks at all and unlock the bootstrap when the `onload` event is fired.
* `timeout`. A timeout function for the checker. An error will be thrown when this timeout is reached and checker does not return `true`. By default, it is equivalent to the timeout specified in the script tag, or 30 seconds.

The object returned can be used as a simpler Angular deferred promise object, but there's no `finally` method on it, only `catch` and `then`. The promise will be fulfilled after the checker has returned `true` for all the scripts.



## Locking the Bootstrap

You can lock bootstrapping of AngularJS with `angular.loader.lock()` (and unlock it with `angular.loader.unlock()`). The functions take a name as parameter. Locking the same name twice, unlocking an unlocked or unknown name are all errors. The only limit on locks are that you cannot lock/unlock once the bootstrap happened. Anything after bootstrapping angular is considered an error.

Locking and unlocking before the end of loading all the modules and their dependencies will simply result in waiting for the dependencies to finish loading.



## <a name="Configuration"></a> Configuration

Configuration is set by calling `angular.loader.config()`. The function takes an object as argument and update the internal configuration.

The list of configuration options is as follow:

* `path`. A map of name to full path (or `null`). If a module name is present in this map, the loader will use this path instead of the name to load. If the full path in the map is `null`, the script will return 
* `pathTransform`. A list of functions that take a path and return a path or `null`. This is to allow transforming a module or script name to its file path. The transform chain will not be executed if the path is part of the `path` option above or is a full URI.
* `checker`. A checker map for modules. See loading custom scripts above. This is to simplify the calls to `angular.loader()`.
* `error`. An error handler. If specified, NO error will be thrown or outputted, they will all be passed to the handler.

The process of getting a script path from a module name is as follow:

```javascript
    var name;  // Original name for the module.
    var path = name in config.path ? config.path[name] : name;  // Path to load.
    if (path === null) return;
    if (isUri(path)) return path;

    for (var i = 0; i < config.transformPath.length; i++) {
    	old_path = path;
	    path = config.transformPath[i](path, name);
    	if (path === null) {
	        path = old_path;
	        break;
    	}
    }

    if (isUri(path)) return path;
    if (path[0] != '/') path = '/' + path;
    if (!/\.js$/.test(path)) path += '.js';
    return path;
```



## <a name="Tests"></a> Tests (Karma and Jasmine)

Some Karma tests are included to cover the most basis cases. Tests are added regularly for better coverage.

To run the tests, simply run `karma run` in the angularjs-loader folder.



# ToDo

For version 1.0:

1. Minification pre-step. Having a script that takes all `angular.module()` calls and merge the scripts into a single file (or multiple).

Future:

1. Nothing really.






# Suggestions / Questions / Praises

If you think of something, create an issue!






# FAQ




### Are there any complex examples out there?

None for now. I want to add some cookbook for this as it can be quite powerful but hard to grasp. I figure that for now the simple case will be enough for most uses.

### Requirejs does X. Why don't you do it?

A mixture of reasons, really. RequireJS has a couple of devs behind it and more bandwidth. Also, I wanted to keep the size really low (AJS-Loader is currently under 3650 bytes minified and uncompressed, while RequireJS sits at 15kb) and performance really high (benchmarks coming later).

Some stuff had to be sacrificed. Mainly, there's no plugin for AJS-Loader, you can't load things that are not scripts (but can load stuff outside of AngularJS modules, of course), it is mainly meant as a developer only script (meaning that production code should use the `concat` script I'm working on), and while path transforms and checkers can be quite powerful, they're also more complex than other solutions.




# Special Thanks

None for now.

