
function waitsForBootstrap() {
    expect(angular.hasBootstrapped()).toBe(false);
    waitsFor(angular.hasBootstrapped);
}


function resetAngularJs() {
    var check = false;

    window['angular'] = {
        loader: angularjs_loader,

        // The module does not need to do anything for angularjs loader.
        module: function() {},

        // Easy way to check if the app bootstrapped.
        bootstrap: function() { check = true; },
        hasBootstrapped: function() { return check; }
    };

    angularjs_loader_reset();
}

describe('lock module', function() {
    beforeEach(resetAngularJs);

    it('should lock and unlock', function() {
        expect(angularjs_loader_locked('hello world')).toBe(false);
        angularjs_loader_lock('hello world');
        expect(angularjs_loader_locked('hello world')).toBe(true);
    });

    it('should unlock and start', function() {
        angularjs_loader_lock('hello world');
        angularjs_loader_unlock('hello world');

        waitsForBootstrap();
    });

    it('should not allow multiple locks of the same name', function() {
        var check = false;

        expect(function() {
            angularjs_loader_lock('hello world');
            angularjs_loader_lock('hello world');
        }).toThrow();
    });
});

describe('the loader', function() {
    beforeEach(resetAngularJs);

    it('should fail to load if not initialized', function() {
        expect(function() {
            angular.loader('testapp');
        }).toThrow();
    });

    it('should load the app on boot', function() {
        angular.loader.init({
            app: 'testapp',
            root: '/base/tests/scripts',
            boot: true
        });

        waitsForBootstrap();
    });

    it('should handle dependencies', function() {
        angular.loader.init({
            app: 'testapp_with_deps',
            root: '/base/tests/scripts',
            boot: true
        });

        waitsForBootstrap();
    });

    it('should allow to load custom scripts', function() {
        angular.loader.init({
            app: 'testapp',
            root: '/base/tests/scripts',
            boot: false
        });

        angular.loader('empty');
        angular.loader('testapp');
        waitsForBootstrap();
    });

    it('should allow to load custom scripts with a checker', function() {
        angular.loader.init({
            app: 'testapp',
            root: '/base/tests/scripts',
            boot: false
        });

        var shim = false;
        window.setTimeout(function() { shim = true; }, 100);
        angular.loader('empty', {checker: function() { return shim; }});
        angular.loader('testapp');

        expect(shim).toBe(false);

        waitsForBootstrap();
        runs(function() {
            expect(shim).toBe(true);
        });
    });

    it('should allow to load custom scripts with shims', function() {
        angular.loader.init({
            app: 'testapp',
            root: '/base/tests/scripts',
            boot: false
        });

        angular.loader('shim', {checker: 'theShim'});
        angular.loader('testapp');

        expect('theShim' in window).toBe(false);

        waitsForBootstrap();
        runs(function() {
            expect('theShim' in window).toBe(true);
        });
    });
});
