# angularjs-loader

A script loader for AngularJS that perform AMD-like script injection without the need for special syntax.


# Rationale

Say you are like me and love having a Javascript file for every module. And you have a lot of scripts with specific tasks; directives, factories, utility functions. You name it.

One solution that we used here is RequireJS, but I grew tired of it; it is becoming too heavy and doesn't integrate that well with AngularJS.

# Example

So I decided to go ahead and build this little script. Here's how it works:

> File `index.html`:
>
>    <html>
>        <head>
>            <script type="text/javascript" src="path/to/angular.js"></script>
>            <script type="text/javascript" src="path/to/angularjs-script.js" app="test_app"></script>
>        </head>
>        
>        <body>
>            <div ng-controller="TestCtrl as test">
>                {{test.value}}<br/>
>            </div>
>        </body>
>    </html>
> ----
> File `test_app.js`:
>
>     angular.module('test_app', ['test_ctrl']);
> ----
> File `test_ctrl.js`:
>
>     angular.module('test_ctrl', []).controller('TestCtrl', function() {
>         this.value = 'Hello World!';
>     });

What angularjs-script does is that it sees the dependency from test_app to test_ctrl and load test_ctrl automatically. It then bootstrap AngularJS when all the scripts are loaded.

Before you needed all the calls to RequireJS with various configuration options, this plugin try to fix all that without the need for crazy shim.

# API

## Script tag.

The script tag for loading this script needs to be inserted after AngularJS, but before the document is ready.

It takes 3 arguments:

* `app`. The main module to load. This is the name of the first script to load.
* `root`. A root to prepend to every path (except absolute paths). By default, no path is prepended.
* `timeout`. A timeout for loading scripts, in milliseconds. If a script hasn't fired an `onload` event, an error will be thrown. By default, 30 seconds.

## Angular Modules

The loader overrides `angular.module()` and does two things:

1. When creating a new module, it takes the list of module dependencies and load the Javascript associated with it (using \<script\> tags).

2. It then uses an atomic lock for bootstrapping and will unlock once the module is created. When all locks are unlocked, it bootstrap AngularJS by calling `angular.bootstrap(document)`.

As you use `angular.module()` to create a module, it will load its dependencies recursively. Using `angular.module()` to only access the module itself is okay and has no side effect.

## Custom Scripts

When you need to load custom scripts you should use the new function `angular.loader()`. It takes 2 arguments and returns a simplified promise object.

The first argument is either a filename or an array of filename to load. Remember that these will be transformed using [path transform](#Configuration).

The second argument is an object of named options:

* `sequence`. Set to `true` to have files loaded in a sequence instead of all at once. Loader will wait for each file to be loaded (`onload` event) before starting the next one.
* `checker`.  A function, a string representing a variable name or an hash map of ScriptName to function or string.  
The `function` is called at regular intervals after the script is loaded and only if it returns `true` will the script considered fully loaded (releasing the lock on bootstrapping Angular).  
If a `string` is specified, it checks for that variable name in `window` and will unlock the bootstrapping when it exists.  
If a `hash map` is specified, it will take each scripts and check them using the either the `function` or the `string` value in the same manner as above.  
Omitting this option performs no checks at all and unlock the bootstrap when the `onload` event is fired.
* `timeout`. A timeout function for the checker. An error will be thrown when this timeout is reached and checker does not return `true`. By default, it is equivalent to the timeout specified in the script tag, or 30 seconds.

The object returned can be used as a simpler Angular deferred promise object, but there's no `finally` method on it, only `catch` and `then`. The promise will be fulfilled after the checker has returned `true` for all the scripts.

## Configuration

*__To Be Done!__*

-----

# ToDo

1. Minification pre-step. Having a script that takes all `angular.module()` calls and merge the scripts into a single file (or multiple).

2. Better `angular.requires()` for scripts that aren't Angular modules.

# Suggestions / Questions / Praises

If you think of something, create an issue!

# FAQ



# Special Thanks

None for now.

