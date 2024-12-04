<template>
  <div class="vtlist" ref="listElRef" :style="listStyle" @scroll.passive="onscroll">
    <VirtualListTable class="vtlist-inner" ref="listInnerRef" :style="listInnerStyle" :table="table">
      <template v-slot:prepend>
        <slot name="prepend"></slot>
      </template>
      <template v-if="disabled">
        <template v-for="(item, index) in items" :key="getItemKey(item, index)">
          <slot :item="item.item" :index="item.index"></slot>
        </template>
      </template>
      <template v-else>
        <template v-for="(item, index) in visibleItemsInfo" :key="getItemKey(item, index)">
          <slot :item="item.item" :index="item.index"></slot>
        </template>
      </template>
      <template v-slot:append>
        <slot name="append"></slot>
      </template>
    </VirtualListTable>
  </div>
</template>

<script>

import VirtualListTable from "./VirtualListTable.vue";
import * as hp from "helper-js";

export default {
  components: {
    VirtualListTable
  },
  props: {
    items: Array,
    disabled: Boolean,
    horizontal: Boolean,
    firstRender: { type: Number, default: 10 },
    buffer: { type: Number, default: 100 },
    itemKey: {
      type: [String, Function],
      default: "index"
    },
    itemSize: Function,
    table: Boolean
  },
  data() {
    return {
      start: 0,
      end: this.firstRender - 1,
      avgSize: 0,
      runtimeSizes: this.items.map(() => null),
      prevScroll: null,
      executing: false,
      waiting: false
    };
  },
  computed: {
    end2() {
      return hp.notGreaterThan(this.end, (this.items?.length || 1) - 1);
    },
    startSize() {
      return this.positions[this.start] ? this.getPosition(this.start) : 0;
    },
    totalSize() {
      return this.positions.length > 0
        ? this.getPosition(this.positions.length - 1) + hp.arrayLast(this.sizes)
        : 0;
    },
    endSize() {
      return this.positions[this.end2] ? (
        this.totalSize - this.getPosition(this.end2) - this.sizes[this.end2]
      ) : 0;
    },
    listStyle() {
      return !this.disabled ? { overflow: "auto" } : {};
    },
    listInnerStyle() {
      const r = {
        display: "flex",
        "flex-direction": this.horizontal ? "row" : "column"
      };
      if (!this.disabled) {
        if (!this.horizontal) {
          r["margin-top"] = `${this.startSize}px`;
          r["margin-bottom"] = `${this.endSize}px`;
        } else {
          r["margin-left"] = `${this.startSize}px`;
          r["margin-right"] = `${this.endSize}px`;
          r.width = `${this.totalSize - this.endSize - this.startSize}px`;
        }
      }
      if (this.table) {
        delete r.display;
        delete r["flex-direction"];
      }
      return r;
    },
    sizes() {
      return this.items.map((item, index) => {
        if (this.runtimeSizes[index] != null) {
          return this.runtimeSizes[index];
        }
        let r = this.itemSize?.(item, index);
        if (r == null) {
          r = this.avgSize;
        }
        return r;
      });
    },
    positions() {
      const p = [];
      this.sizes.reduce((a, b) => {
        p.push(a);
        return a + b;
      }, 0);
      return p;
    },
    visibleItemsInfo() {
      if (!this.items || this.disabled) {
        return [];
      }
      const r = [];
      for (let index = this.start; index <= this.end2; index++) {
        const item = this.items[index];
        if (!item) {
          break;
        }
        r.push({ item, index });
      }
      return r;
    }
  },
  watch: {
    items: "update"
  },
  mounted() {
    // console.log('items', this.items)
    this.update();
    try {
      this.createResizeObserver();
    } catch (error) {
      // ResizeObserver fallback
      this.$nextTick(() => this.update());
    }
  },
  methods: {
    onscroll() {
      const listEl = this.$refs.listElRef;
      // console.log('listEl', listEl)
      if (!listEl) {
        return;
      }
      const currentScroll = this.getScroll(listEl);
      if (
        this.prevScroll != null &&
        this.buffer - Math.abs(currentScroll - this.prevScroll) >= 10
      ) {
        return;
      }
      this.prevScroll = currentScroll;
      this.update();
    },
    update() {
      if (this.executing) {
        this.waiting = true;
        return;
      }
      if (!this.items || this.disabled) {
        return;
      }
      this.executing = true;
      const listEl = this.$refs.listElRef;
      const listInner = this.$refs.listInnerRef?.$el;
      if (!listEl || !listInner) {
        return;
      }

      if (!this.avgSize) {
        this.avgSize = this.getAvgSize();
      }
      this.start = this.getStart();
      this.end = this.getEnd();

      this.$nextTick().then(() => {
        this.updateRuntimeSize();
        this.executing = false;
        if (this.waiting) {
          this.waiting = false;
          this.update();
        }
      });
    },
    updateRuntimeSize() {
      let updated = false;
      const runtimeSizesTemp = {};
      const children = !this.table
        ? this.$refs.listInnerRef.$el.children
        : this.$refs.listInnerRef.$el.querySelector("tbody").children;

      let vi0 = 0;
      for (let i = 0; i < children.length; i++) {
        const el = children[i];
        const cssPosition = hp.css(el, "position");
        if (cssPosition && ["absolute", "fixed"].includes(cssPosition)) {
          continue;
        }
        const size = hp.css(el, "display") !== "none" ? this.getOuterSize(el) : 0;
        const vi = el.getAttribute("vt-index");
        const index = vi ? parseInt(vi) : this.start + vi0;
        runtimeSizesTemp[index] = (runtimeSizesTemp[index] || 0) + size;
        vi0++;
      }
      for (const indexS of Object.keys(runtimeSizesTemp)) {
        const index = parseInt(indexS);
        if (this.runtimeSizes[index] !== runtimeSizesTemp[index]) {
          this.runtimeSizes[index] = runtimeSizesTemp[index];
          updated = true;
        }
      }
      if (updated) {
        this.$nextTick();
      }
    },
    getStart() {
      const startPosition =
        this.getScroll(this.$refs.listElRef) - this.getPaddingStart(this.$refs.listElRef) - this.buffer;
      const r = hp.binarySearch(
        this.positions,
        (mid) => mid - startPosition,
        { returnNearestIfNoHit: true }
      );
      return r.index;
    },
    getEnd() {
      const endPosition =
        this.getScroll(this.$refs.listElRef) -
        this.getPaddingStart(this.$refs.listElRef) +
        this.getClientSize(this.$refs.listElRef) +
        this.buffer;

      const r = hp.binarySearch(
        this.positions,
        (mid) => mid - endPosition,
        { returnNearestIfNoHit: true }
      );
      return r.index;
    },
    getAvgSize() {
      const maxSampleCount = 10;
      const sizeArr = [];
      const children = !this.table
        ? this.$refs.listInnerRef.$el.children
        : this.$refs.listInnerRef.$el.querySelector("tbody").children;
      // console.log('children', children)
      for (let index = 0; index < children.length; index++) {
        const el = children[index];
        const style = getComputedStyle(el);
        if (["absolute", "fixed"].includes(style.position)) {
          continue;
        }
        const outerSize = this.getOuterSize(el);
        sizeArr.push(outerSize);
        if (sizeArr.length >= maxSampleCount) {
          break;
        }
      }
      if (sizeArr.length === 0) {
        return 0;
      }
      return sizeArr.reduce((a, b) => a + b, 0) / sizeArr.length;
    },
    getClientSize(el) {
      const style = getComputedStyle(el);
      let r = parseFloat(!this.horizontal ? style.height : style.width);
      if (style.boxSizing === "border-box") {
        if (!this.horizontal) {
          r =
            r -
            parseFloat(style.borderTopWidth) -
            parseFloat(style.borderBottomWidth);
        } else {
          r =
            r -
            parseFloat(style.borderLeftWidth) -
            parseFloat(style.borderRightWidth);
        }
      }
      return r;
    },
    getOuterSize(el) {
      let r = this.getClientSize(el);
      const style = getComputedStyle(el);
      if (!this.horizontal) {
        r +=
          parseFloat(style.borderTopWidth) +
          parseFloat(style.borderBottomWidth) +
          parseFloat(style.marginTop) +
          parseFloat(style.marginBottom);
      } else {
        r +=
          parseFloat(style.borderLeftWidth) +
          parseFloat(style.borderRightWidth) +
          parseFloat(style.marginLeft) +
          parseFloat(style.marginRight);
      }
      r = Number.isNaN(r) ? 0 : r;
      return r;
    },
    getScroll(el) {
      return !this.horizontal ? el.scrollTop : el.scrollLeft;
    },
    getPaddingStart(el) {
      const style = getComputedStyle(el);
      return !this.horizontal
        ? parseFloat(style.paddingTop)
        : parseFloat(style.paddingLeft);
    },
    getPosition(index) {
      return this.positions[index];
    },
    createResizeObserver() {
      const listEl = this.$refs.listElRef;
      const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          if (hp.hasClass(entry.target, "vtlist")) {
            this.update();
            break;
          }
        }
      });
      resizeObserver.observe(listEl);
    },
    getItemKey(item, index) {
      if (this.itemKey) {
        if (typeof this.itemKey === "string" && this.itemKey === "index") {
          return index;
        } else if (typeof this.itemKey === "function") {
          return this.itemKey(item, index);
        }
      }
    }
  }
}
</script>

<style scoped>
/* Add styles as necessary */
</style>
