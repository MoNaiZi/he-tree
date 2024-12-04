import { makeTreeProcessor } from "@he-tree/tree-utils";
export * from "@he-tree/tree-utils";
import { reactive } from "vue-demi";

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
      return filter(options.statsHandler, reactive(input));
    },
    statsFlatHandler(input) {
      return filter(options.statsFlatHandler, reactive(input));
    },
  };
  return makeTreeProcessor(data, opt);
}
function filter(func, input) {
  return func ? func(input) : input;
}
