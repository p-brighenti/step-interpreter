const vm = require('vm');
const EventEmitter = require('eventemitter3');
const { prepare } = require('./code-transforms');
const { adaptError } = require('./error-adapters');
const Context = require('./context');
const Stepper = require('./stepper');

class Interpreter {
    constructor(options = {}) {
        const { stepTime = 15, on = {}, context = {} } = options;

        this.getStepper = stepperFactory(this, { stepTime });
        this.stepper = this.getStepper();

        this.context = new Context(this, context);
        this.events = new EventEmitter();

        this.on('start', on.start);
        this.on('step', on.step);
        this.on('exit', on.exit);
    }

    on(event, handler) {
        if (typeof handler !== 'function') {
            return;
        }

        this.events.on(event, handler);
        return () => this.events.off(event, handler);
    }

    async run(code, { initialize = async () => {} } = {}) {
        const transformedCode = prepare(code);
        const executor = vm.runInNewContext(
            `
            __initialize__(this);
            ${transformedCode}
            `,
            {
                ...this.context.getInterpreterContext(),
                __initialize__: contextSetup(initialize)
            }
        );

        try {
            this.events.emit('start');
            await executor();
            this.events.emit('exit');
        } catch (err) {
            if (err === 'stepper-destroyed') {
                return;
            }

            throw adaptError(err);
        }
    }

    resume() {
        this.stepper.resume();
    }

    pause() {
        this.stepper.pause();
    }

    stop() {
        this.stepper.destroy();
        this.stepper = this.getStepper();
    }

    setStepTime(ms) {
        this.stepper.setStepTime(ms);
    }
}

module.exports = Interpreter;

function stepperFactory(interpreter, options) {
    let stepper;
    let stepDisposer;

    return () => {
        if (stepDisposer) {
            stepDisposer();
        }
        stepper = new Stepper(options);
        stepDisposer = stepper.on('step', () =>
            interpreter.events.emit('step')
        );

        return stepper;
    };
}

function contextSetup(initialize = () => {}) {
    return context => {
        const { Array } = context;
        Array.prototype.reduce = reduce;
        Array.prototype.forEach = forEach;
        Array.prototype.filter = filter;
        initialize(context);
    };
}

async function reduce(reducer, initialValue) {
    const { reduce } = Array.prototype;
    return reduce.call(
        this,
        async (acc, ...args) => {
            acc = await acc;
            return await reducer(acc, ...args);
        },
        initialValue
    );
}

async function forEach(fn, boundTo = this) {
    for (let i = 0; i < this.length; i++) {
        await fn.call(boundTo, this[i], i, this);
    }
}

async function filter(fn) {
    for (let i = 0; i < this.length; i++) {
        await fn(this[i], i, this);
    }
}
