(function (root) {
  'use strict';

  var groups = ['simulation', 'flight', 'rendering', 'assets', 'artwork', 'audio', 'tooling'];

  function create(options) {
    options = options || {};
    var document = options.document || root.document;
    var output = options.console || root.console;
    var selected = options.group !== undefined ? options.group : root.DRIFTWORKS_TEST_GROUP;
    if (selected === undefined) selected = new URLSearchParams(root.location ? root.location.search : '').get('group');
    var tests = [], names = new Set(), finished = false;

    function invalid(message) {
      var summary = document.querySelector('#summary');
      summary.className = 'fail';
      summary.textContent = message;
      throw new Error(message);
    }
    if (selected !== null && groups.indexOf(selected) < 0) invalid('Unknown test group: ' + selected);

    function test(group, name, fn) {
      if (finished) invalid('Cannot register tests after the suite has run');
      if (groups.indexOf(group) < 0) invalid('Unknown test group: ' + group);
      if (names.has(name)) invalid('Duplicate test name: ' + name);
      if (typeof fn !== 'function') invalid('Missing test function: ' + name);
      names.add(name);
      tests.push({group: group, name: name, fn: fn});
    }
    function assert(condition, message) {
      if (!condition) throw new Error(message || 'Assertion failed');
    }
    function assertClose(actual, expected, epsilon) {
      var limit = epsilon || 0.000001;
      assert(Math.abs(actual - expected) <= limit, 'Expected ' + actual + ' to be within ' + limit + ' of ' + expected);
    }
    function run() {
      if (finished) invalid('The shared suite has already run');
      finished = true;
      var summary = document.querySelector('#summary'), results = document.querySelector('#results');
      var active = tests.filter(function (current) {return selected === null || current.group === selected;});
      if (!active.length) invalid('No tests registered for ' + (selected || 'the shared suite'));
      var passed = 0;
      active.forEach(function (current) {
        var item = document.createElement('li');
        try {
          current.fn();
          item.className = 'pass';
          item.textContent = 'PASS: ' + current.name;
          passed++;
        } catch (error) {
          item.className = 'fail';
          item.textContent = 'FAIL: ' + current.name;
          var detail = document.createElement('pre');
          detail.textContent = error && error.stack || String(error);
          item.appendChild(detail);
          output.error(current.name, error);
        }
        results.appendChild(item);
      });
      var failed = active.length - passed;
      var label = selected ? selected + ' shared tests' : 'browser-native tests';
      summary.className = failed ? 'fail' : 'pass';
      summary.textContent = failed ? failed + ' of ' + active.length + ' ' + label + ' failed.' : 'All ' + passed + ' ' + label + ' passed.';
      return {group: selected, passed: passed, failed: failed, total: active.length, registered: tests.length};
    }
    return {test: test, assert: assert, assertClose: assertClose, run: run};
  }

  var api = {groups: groups, create: create};
  if (typeof window !== 'undefined') root.DriftworksTestHarness = api;
  else if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
