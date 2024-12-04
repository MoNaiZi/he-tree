<template>
  <VirtualList class="he-tree" :class="{
    'he-tree--rtl rtl': rtl,
    'he-tree--drag-overing drag-overing': dragOvering,
  }" ref="vtlist" :items="visibleStats" :disabled="!virtualization" :table="table" :itemKey="nodeKey">
    <template #prepend>
      <slot name="prepend" :tree="self"></slot>
    </template>
    <template #default="{ item: stat, index }">
      <TreeNode :vt-index="index" :class="[
        stat.class,
        {
          'drag-placeholder-wrapper': stat.data === placeholderData,
          'dragging-node': stat === dragNode,
        },
      ]" :style="stat.style" :stat="stat" :rtl="rtl" :btt="btt" :indent="indent" :table="table" :treeLine="treeLine"
        :treeLineOffset="treeLineOffset" :processor="processor" @click="$emit('click:node', stat)"
        @open="$emit('open:node', $event)" @close="$emit('close:node', $event)" @check="$emit('check:node', $event)">
        <template #default="{ indentStyle }">
          <template v-if="stat.data === placeholderData">
            <div v-if="!table" class="drag-placeholder he-tree-drag-placeholder">
              <slot name="placeholder" :tree="self"></slot>
            </div>
            <td v-else :style="indentStyle" :colspan="placeholderColspan">
              <div class="drag-placeholder he-tree-drag-placeholder">
                <slot name="placeholder" :tree="self"></slot>
              </div>
            </td>
          </template>
          <slot v-else :node="stat.data" :stat="stat" :indentStyle="indentStyle" :tree="self">{{ stat.data[textKey] }}
          </slot>
        </template>
      </TreeNode>
    </template>
    <template #append>
      <slot name="append" :tree="self"></slot>
    </template>
  </VirtualList>
</template>

<script>
// 如果遇到滚动不流畅的情况，不用处理，因为Dev tool造成的。
// If the scrolling is not smooth, do not deal with it, because it is caused by the Dev tool.
import * as hp from "helper-js";
import VirtualList from "./VirtualList/VirtualList.vue";
// import VirtualList from "../virtual-list";
import TreeNode from "./TreeNode.vue";
import { vueMakeTreeProcessor } from "./TreeProcessorVue";
// console.log('isVue2', isVue2, isVue3)
const isVue2 = false, isVue3 = true
const cpt = {
  components: { VirtualList, TreeNode },
  props: {
    // for vue2
    value: { required: isVue2, type: Array },
    // for vue3
    modelValue: { required: isVue3, type: Array },
    updateBehavior: {
      type: String,
      default: "modify",
    },
    processor: {
      type: Object,
      default: () =>
        vueMakeTreeProcessor([], {
          noInitialization: true,
        }),
    },
    childrenKey: { type: String, default: "children" },
    /**
     * for default slot. 用于默认插槽
     */
    textKey: { type: String, default: "text" },
    /**
     * node indent. 节点缩进
     */
    indent: { type: Number, default: 20 },
    /**
     * Enable virtual list. 启用虚拟列表
     */
    virtualization: { type: Boolean, default: false },
    /**
     * Render count for virtual list at start. 虚拟列表初始渲染数量.
     */
    virtualizationPrerenderCount: { type: Number, default: 20 },
    /**
     * Open all nodes by default. 默认打开所有节点.
     */
    defaultOpen: { type: Boolean, default: true },
    statHandler: { type: Function },
    /**
     * From right to left. 由右向左显示.
     */
    rtl: { type: Boolean, default: false },
    /**
     * From bottom to top. 由下向上显示
     */
    btt: { type: Boolean, default: false },
    /**
     * Display as table
     */
    table: { type: Boolean, default: false },
    watermark: { type: Boolean, default: false },
    nodeKey: {
      type: [String, Function],
      default: "index",
    },
    treeLine: { type: Boolean, default: false },
    treeLineOffset: { type: Number, default: 8 },
  },
  emits: [
    "update:modelValue",
    "click:node",
    "open:node",
    "close:node",
    "check:node",
    "beforeDragStart",
    "before-drag-start",
    "after-drop",
    "change",
    "enter",
    "leave",
  ],
  data() {
    return {
      stats: [],
      statsFlat: [],
      dragNode: null,
      dragOvering: false,
      placeholderData: {},
      placeholderColspan: 1,
      batchUpdateWaiting: false,
      self: this,
      _ignoreValueChangeOnce: false,
    };
  },
  computed: {
    valueComputed() {
      return (isVue2 ? this.value : this.modelValue) || [];
    },
    visibleStats() {
      const { statsFlat, isVisible } = this;
      let items = statsFlat;
      if (this.btt) {
        items = items.slice();
        items.reverse();
      }
      return items.filter((stat) => isVisible(stat));
    },
    rootChildren() {
      return this.stats;
    },
  },
  methods: {
    _emitValue(value) {
      // @ts-ignore
      this.$emit(isVue2 ? "input" : "update:modelValue", value);
    },
    /**
     * private method
     * @param value
     */
    _updateValue(value) {
      if (this.updateBehavior === "disabled") {
        return false;
      }
      // if value changed, ignore change once
      if (value !== this.valueComputed) {
        this._ignoreValueChangeOnce = true;
      }
      this._emitValue(value);
      return true;
    },
    getStat: reactiveFirstArg(
      processorMethodProxy("getStat")
    ),
    has: reactiveFirstArg(processorMethodProxy("has")),
    updateCheck: processorMethodProxy(
      "updateCheck"
    ),
    getChecked: processorMethodProxy(
      "getChecked"
    ),
    getUnchecked: processorMethodProxy(
      "getUnchecked"
    ),
    openAll: processorMethodProxy("openAll"),
    closeAll: processorMethodProxy("closeAll"),
    openNodeAndParents: processorMethodProxy(
      "openNodeAndParents"
    ),
    isVisible: processorMethodProxy("isVisible"),
    move: processorMethodProxyWithBatchUpdate("move"),
    add: reactiveFirstArg(
      processorMethodProxyWithBatchUpdate("add")
    ),
    addMulti(
      dataArr,
      parent,
      startIndex
    ) {
      this.batchUpdate(() => {
        let index = startIndex;
        for (const data of dataArr) {
          this.add(data, parent, index);
          if (index != null) {
            index++;
          }
        }
      });
    },
    remove: processorMethodProxy("remove"),
    removeMulti(dataArr) {
      let cloned = [...dataArr];
      this.batchUpdate(() => {
        for (const data of cloned) {
          this.remove(data);
        }
      });
    },
    iterateParent: processorMethodProxy(
      "iterateParent"
    ),
    getSiblings: processorMethodProxy(
      "getSiblings"
    ),
    getData: processorMethodProxy("getData"),
    getRootEl() {
      // @ts-ignore
      return this.$refs.vtlist.$el;
    },
    batchUpdate(task) {
      const r = this.ignoreUpdate(task);
      if (!this.batchUpdateWaiting) {
        this._updateValue(
          this.updateBehavior === "new" ? this.getData() : this.valueComputed
        );
      }
      return r;
    },
    ignoreUpdate(task) {
      const old = this.batchUpdateWaiting;
      this.batchUpdateWaiting = true;
      const r = task();
      this.batchUpdateWaiting = old;
      return r;
    },
  },
  watch: {
    processor: {
      immediate: true,
      handler(processor) {
        if (processor) {
          // hook
          const getNodeDataChildren = (nodeData) => {
            if (!nodeData) {
              return this.valueComputed;
            } else {
              const { childrenKey } = this;
              if (!nodeData[childrenKey]) {
                nodeData[childrenKey] = [];
              }
              return nodeData[childrenKey];
            }
          };

          // processor["_statHandler2"] = this.statHandler
          //   ? (stat) => {
          //     if (stat.data === this.placeholderData) {
          //       return stat;
          //     }
          //     return this.statHandler(stat);
          //   }
          //   : null;

          processor.afterSetStat = (stat, parent, index) => {
            const { childrenKey, updateBehavior } = this;
            let value = this.valueComputed;
            if (updateBehavior === "new") {
              if (this.batchUpdateWaiting) {
                return;
              }
              value = this.getData();
            } else if (updateBehavior === "modify") {
              const siblings = getNodeDataChildren(parent?.data);
              if (siblings.includes(stat.data)) {
                // when call add -> add child -> _setPositionm ignore because the child already in parent.children
              } else {
                siblings.splice(index, 0, stat.data);
              }
            } else if (updateBehavior === "disabled") {
            }
            if (this.batchUpdateWaiting) {
              return;
            }
            this._updateValue(value);
          };
          processor.afterRemoveStat = (stat) => {
            const { childrenKey, updateBehavior } = this;
            let value = this.valueComputed;
            if (updateBehavior === "new") {
              if (this.batchUpdateWaiting) {
                return;
              }
              value = this.getData();
            } else if (updateBehavior === "modify") {
              const siblings = getNodeDataChildren(stat.parent?.data);
              hp.arrayRemove(siblings, stat.data);
            } else if (updateBehavior === "disabled") {
            }
            if (this.batchUpdateWaiting) {
              return;
            }
            this._updateValue(value);
          };
        }

        if (!processor.initialized) {
          processor.data = this.valueComputed;
          Object.assign(
            processor,
            hp.objectOnly(this, ["childrenKey", "defaultOpen"])
          );
          processor.init();
          processor.updateCheck();
        }
        this.stats = processor.stats;
        this.statsFlat = processor.statsFlat;
        if (processor.data !== this.valueComputed) {
          this._updateValue(processor.data);
        }
      },
    },
    valueComputed: {
      handler(value) {
        // isDragging triggered in Vue2 because its array is not same with Vue3
        const isDragging = this.dragOvering || this.dragNode;
        if (isDragging || this._ignoreValueChangeOnce) {
          this._ignoreValueChangeOnce = false;
        } else {
          const { processor } = this;
          processor.data = value;
          processor.init();
          this.stats = processor.stats;
          this.statsFlat = processor.statsFlat;
        }
      },
    },
  },
  created() { },
  mounted() {
    if (typeof window !== "undefined") {
      if (this.watermark === false) {
        // @ts-ignore
        window._heTreeWatermarkDisabled = true;
      }
      // @ts-ignore
      if (this.watermark && !window._heTreeWatermarkDisabled) {
        // @ts-ignore
        if (!window._heTreeWatermark) {
          // @ts-ignore
          window._heTreeWatermark = true;
          console.log(
            `%c[he-tree] Vue tree component:  https://hetree.phphe.com`,
            "color:#0075ff; font-size:14px;"
          );
        }
      }
    }
  },
}

export default cpt;

function processorMethodProxy(name) {
  return function (...args) {
    // @ts-ignore
    return this.processor[name](...args);
  };
}
function processorMethodProxyWithBatchUpdate(name) {
  return function (...args) {
    // @ts-ignore
    return this.batchUpdate(() => {
      // @ts-ignore
      return this.processor[name](...args);
    });
  };
}
function reactiveFirstArg(func) {
  return function (arg1, ...args) {
    if (arg1) {
      arg1 = arg1
    }
    // @ts-ignore
    return func.call(this, arg1, ...args);
  };
}
</script>

<style>
.he-tree--rtl {
  direction: rtl;
}

.he-tree-drag-placeholder {
  background: #ddf2f9;
  border: 1px dashed #00d9ff;
  height: 22px;
  width: 100%;
}
</style>
