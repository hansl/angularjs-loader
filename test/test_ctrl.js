
angular.module('test_ctrl', ['subdir.my_mod'])
    .controller('TestCtrl', ['Factory', function(Factory) {
        return angular.extend(this, Factory);
    }]);
