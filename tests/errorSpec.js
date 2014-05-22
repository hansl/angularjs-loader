
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

describe('error module', function() {
    beforeEach(resetAngularJs);

    it('should format error messages', function() {
        expect(function() {
            angularjs_loader_error(1, [2, 3], 'Hello {0} World {1}.');
        }).toThrow('Hello 2 World 3.');
    });

    it('should allow you to set your own handler', function() {
        var reported = false;
        var id = 1;
        var params = [2, 3];

        angular.loader.config({
            error: function(a, b) {
                reported = true;
                expect(a).toBe(id);
                expect(b).toBe(params);
            }
        });
        angularjs_loader_error(1, params);

        expect(reported).toBe(true);
    });
});
