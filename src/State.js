(function (definition) {
    if (typeof define == 'function') define(definition);
    else if (typeof module != 'undefined') module.exports = definition(require, module.exports, module);
})(function (require, exports, module) {
    "use strict";
    var getType = function (obj) {
        var type = Object.prototype.toString.call(obj);
        return type.substring(8, type.length - 1).toLowerCase();
    };

    var extend = function (target, source) {
        for (var key in source)
            target[key] = source[key]
    };

    var inherits = function (child, parent, proto) {
        child.prototype = Object.create(parent.prototype, {
            constructor: {
                value: child,
                enumerable: false,
                writable: true,
                configurable: true
            },
            _super: {
                value: parent,
                enumerable: false,
                writable: true,
                configurable: true
            }
        });
        extend(child.prototype, proto);
        return child;
    };


    var InvalidStateError = function (message) {
        this.name = 'InvalidStateError';
        this.message = message;
    };

    InvalidStateError.prototype = new Error();
    InvalidStateError.prototype.constructor = InvalidStateError;


    /**
     *
     * @param config
     * @returns {State}
     * @constructor
     * @example
     * State({
     *     initState : 'start',
     *     states : [
     *          {
     *              name : '',
     *              states : [],
     *              transform : []
     *          }
     *     ]
     * });
     */

    var State = function (config) {

        if (!(this instanceof State)) {
            return new State(config);
        }
        config || (config = {});

        //设置状态名
        this.name = config.name || 'root';

        //默认状态机
        this.machine = config.machine || this;

        //复合状态子状态
        this.childs = {};

        //事件列表
        this._events = {};

        if (config.states) {
            this.addState(config.states);
        }

        //绑定状态变换
        this.transforms = [];
        if (config.transforms) {
            this.addTransform(config.transforms);
        }

        //进入事件
        config.enter && this.on('enter', config.enter);
        config.leave && this.on('leave', config.leave);

        //设置初始状态
        if (config.initState && (config.initState = State.find(this, config.initState))) {
            this.initState = config.initState;
        }

        //当前子状态
        this.activeState = null;
    };

    //获取两个节点的最小公共祖先
    State.getLCA = function (state1, state2) {
        if (state1 == state2) {
            return state1;
        }

        var parent1 = [state1], parent2 = [state2];
        while (state1 = state1.parent) {
            parent1.unshift(state1);
        }
        while (state2 = state2.parent) {
            parent2.unshift(state2);
        }

        //从跟节点开始往下找
        for (var i = 0; i < parent1.length; i++) {
            if (parent1[i] != parent2[i]) {
                break;
            }
        }
        return parent1[i - 1];
    };

    //从父状态中寻找子状态
    State.find = function (parent, state) {
        if (typeof state == 'string') {
            var states = state.split('.');
            state = parent;
            while (state && states.length) {
                state = state.childs[states.shift()];
            }
        } else if (state instanceof State) {
            var bak = state;
            while (bak && bak != parent) {
                bak = bak.parent;
            }
            if (!bak) {
                state = null;
            }
        }

        return state;
    };

    State.prototype = {
        //创建子状态
        addState: function (states) {
            if (states instanceof State) {
                states.parent = this;
                states.machine = this.machine;
                this.childs[states.name] = states;
            } else {
                for (var name in states) {
                    states[name].machine = this.machine;
                    var state = State(states[name]);
                    state.name = name;
                    state.parent = this;
                    this.childs[state.name] = state;
                }
            }
        },

        transform: function (nextState) {
            nextState = State.find(this.machine, nextState);

            if(!nextState){
                throw new InvalidStateError('Invalid next state.');
            }

            var activeState = this.machine.activeState,
                nearParent = this.machine,
                state,
                i;

            if(this.machine != nextState.machine){
                throw new InvalidStateError('Invalid different machine.');
            }

            if(activeState == nextState){
                activeState.emit('leave');
                nextState.emit('enter');
                return;
            }

            if(activeState){
                nearParent = State.getLCA(activeState, nextState);
                state = activeState;
                while (state != nearParent) {
                    state.emit('leave');
                    state = state.parent
                }
            }

            //递归初始节点，直至原子节点
            while(nextState.initState){
                 nextState = nextState.initState;
            }

            //更新当前状态
            this.machine.activeState = nextState;

            var enterList = [];
            while (nextState && nextState != nearParent) {
                enterList.unshift(nextState);
                nextState = nextState.parent;
            }

            //初始化
            if (!activeState) {
                enterList.unshift(this.machine);
            }

            for (i = 0; state = enterList[i]; i++) {
                state.emit('enter');
            }
        },

        //设置状态变换
        addTransform: function (transforms) {
            extend(this.transforms, transforms);
            for (var event in transforms) {
                this.on(event, this.transform.bind(this, transforms[event]));
            }
        },

        //事件绑定
        on: function (type, callback) {
            this._events[type] || (this._events[type] = []);
            this._events[type].push(callback);
        },
        off: function (type, callback) {
            var callbacks = this._events[type], index;
            if (callbacks && callback) {
                index = callbacks.indexOf(callback);
                (~index) && callbacks.splice(index, 1);
            } else {
                this._events[type] = [];
            }
        },
        emit: function (type) {
            if (!this._events[type]) {
                return false;
            }
            var args = Array.prototype.slice.call(arguments, 1);

            for (var i = 0; i < this._events[type].length; i++) {
                this._events[type][i].apply(this, args);
            }
        },

        //启动
        start : function(){
            this.transform(this);
        },

        stop : function(){
            this.machine.activeState && this.machine.activeState.emit('exit');
        }
    };

    return State;
});