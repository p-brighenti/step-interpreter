const sinon = require('sinon');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinonChai = require('sinon-chai');
const Interpreter = require('../src/interpreter');

const { expect } = chai;
chai.use(chaiAsPromised);
chai.use(sinonChai);

describe('interpreter', function() {
    describe('execution', function() {
        it('.run() should return a promise that fulfills when interpreter finishes executing the code', async function() {
            const code = `
          const a = 1;
          const b = 2;
          const c = sum(a, b);

          function sum(a , b) {
            return a + b;
          }
        `;

            const interpreter = new Interpreter();
            return expect(interpreter.run(code)).to.eventually.be.fulfilled;
        });

        it('.run() should return a promise that fulfills when execution is terminated by the user', async function() {
            const code = `
            while(true) {
                const a = 1;
            }
        `;

            const interpreter = new Interpreter();
            setTimeout(() => interpreter.stop(), 200);
            await expect(interpreter.run(code)).to.eventually.be.fulfilled;
        });

        it('.run() should be able to run more code after stopping', async function() {
            const code = `
            const TIMES = 5;
            for (let i = 0; i < TIMES; i++) {
                const a = 1;
            }
        `;

            const interpreter = new Interpreter();
            setTimeout(() => interpreter.stop(), 100);
            await expect(interpreter.run(code)).to.eventually.be.fulfilled;
            await expect(interpreter.run(code)).to.eventually.be.fulfilled;
        });

        it('.run() should be able to execute async code top-level', async function() {
            const code = `
            const a = 1;
            await run();
            const b = 2;

            async function run() {}
        `;

            const interpreter = new Interpreter();
            return expect(interpreter.run(code)).to.eventually.be.fulfilled;
        });

        it('.run() promise should never fulfill if execution is paused', async function() {
            const code = `
            const TIMES = 5;
            for (let i = 0; i < TIMES; i++) {
                const a = 1;
            }
        `;
            const interpreter = new Interpreter();
            setTimeout(() => interpreter.pause(), 10);
            setTimeout(() => interpreter.resume(), 200);
            return expect(interpreter.run(code)).to.eventually.be.fulfilled;
        });

        it('.run() should throw ReferenceError', async function() {
            const code = `
          const a = 1;
          const b = a + badVariable;
        `;

            const interpreter = new Interpreter();
            return expect(interpreter.run(code)).to.be.eventually.rejectedWith(
                ReferenceError,
                'badVariable'
            );
        });

        it('.run() should throw SyntaxError', async function() {
            const code = `
          const a =;
        `;

            const interpreter = new Interpreter();
            return expect(interpreter.run(code)).to.be.eventually.rejectedWith(
                SyntaxError
            );
        });

        it('should be able to run a for loop', async function() {
            const callback = sinon.fake();
            const code = `
            for(let i = 0; i < 5; i++) {
                callback(i);
            }
            `;

            const interpreter = new Interpreter({
                context: { callback }
            });

            await interpreter.run(code);
            expect(callback).to.have.been.calledWith(0);
            expect(callback).to.have.been.calledWith(1);
            expect(callback).to.have.been.calledWith(2);
            expect(callback).to.have.been.calledWith(3);
            expect(callback).to.have.been.calledWith(4);
            expect(callback).to.have.been.callCount(5);
        });

        it('should be protected against infinite while loops', async function() {
            const code = `
            while(true) {}
        `;

            const interpreter = new Interpreter();
            setTimeout(() => interpreter.stop(), 200);
            await expect(interpreter.run(code)).to.eventually.be.fulfilled;
        });

        it('should be protected against infinite for loops', async function() {
            const code = `
            for (;;) {}
        `;

            const interpreter = new Interpreter();
            setTimeout(() => interpreter.stop(), 200);
            await expect(interpreter.run(code)).to.eventually.be.fulfilled;
        });
    });
    describe('events', function() {
        it('should call on.start event', async function() {
            const callback = sinon.fake();
            const code = `
            test();
            function test() {}
            `;

            const interpreter = new Interpreter({
                on: { start: callback }
            });

            await interpreter.run(code);
            expect(callback).to.have.been.called;
        });
        it('should call on.step event', async function() {
            const callback = sinon.fake();
            const code = `
            const firstStep = 1;
            `;

            const interpreter = new Interpreter({
                on: { step: callback }
            });

            await interpreter.run(code);
            expect(callback).to.have.been.called;
        });
        it('should call on.step event 2 times', async function() {
            const callback = sinon.fake();
            const code = `
            const firstStep = 1;
            const secondStep = 2;
            `;

            const interpreter = new Interpreter({
                on: { step: callback }
            });

            await interpreter.run(code);
            expect(callback).to.have.been.calledTwice;
        });
        it('should call on.step event 4 times', async function() {
            const callback = sinon.fake();
            const code = `
            const elements = [1, 2];
            const newElements = elements.map(e => e + 1);
            `;

            const interpreter = new Interpreter({
                on: { step: callback }
            });

            await interpreter.run(code);
            expect(callback).to.have.callCount(4);
        });
        it('should call on.exit event', async function() {
            const callback = sinon.fake();
            const code = `
            test();
            function test() {}
            `;

            const interpreter = new Interpreter({
                on: { exit: callback }
            });

            await interpreter.run(code);
            expect(callback).to.have.been.called;
        });
    });
    describe('async array operations', function() {
        it('should provide async version of Array.prototype.map', async function() {
            const verifier = sinon.fake();
            const code = `
                const array = [1,2,3];
                const transformed = array.map(async element => {
                    return element;
                });
                verifier(transformed);
            `;

            const interpreter = new Interpreter({ context: { verifier } });
            await interpreter.run(code);
            expect(verifier).to.have.been.calledWithExactly([1, 2, 3]);
        });
        it('should provide async version of Array.prototype.forEach', async function() {
            const callback = sinon.fake();
            const verifier = sinon.fake();
            const code = `
                const array = [1,2,3];

                array.forEach(async element => callback(element));
                verifier();
            `;

            const interpreter = new Interpreter({
                context: { callback, verifier }
            });
            await interpreter.run(code);
            expect(verifier).to.have.been.calledAfter(callback);
            expect(callback).to.not.have.been.calledAfter(verifier);
        });
    });

    describe('context tests', function() {
        it('should be able to call outside function', async function() {
            const callback = sinon.fake();
            const code = `callback();`;
            const interpreter = new Interpreter({
                context: { callback }
            });

            await interpreter.run(code);
            expect(callback).to.have.been.called;
        });
    });
});
