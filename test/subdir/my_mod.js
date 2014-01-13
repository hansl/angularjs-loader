'use strict';

(function() {

angular.requires('//ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js', '$');

var mod = angular.module('subdir.my_mod', []);

mod.factory('Factory', function() {
    return {
        value: 'Hello World!',
        isJQueryLoaded: (typeof $ == 'function')
    };
});

})();