import { reactive } from "@vue/reactivity";
import { makeTreeProcessor } from "./tree-utils";

export function vueMakeTreeProcessor(data, options) {
  const opt = {
    ...options,
    statHandler(input) {
      if (this["_statHandler2"]) {
        input = this["_statHandler2"](input);
      }
      return filter(options.statHandler, reactive(input));
    },
    statsHandler(input) {
      return filter(options.statsHandler, input);
    },
    statsFlatHandler(input) {
      return filter(options.statsFlatHandler, reactive(input));
    },
  };
  const res = makeTreeProcessor(data, opt);
  return res;
}
function filter(func, input) {
  return func ? func(input) : input;
}
