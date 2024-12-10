<template>
  <div v-if="!table" class="tree-node" :class="{ 'tree-node--with-tree-line': treeLine }" :style="indentStyle" ref="el">
    <template v-if="treeLine">
      <div v-for="line in vLines" class="tree-line tree-vline" :style="line.style"></div>
      <div v-if="stat.level > 1" class="tree-line tree-hline" :style="hLineStyle"></div>
    </template>
    <div class="tree-node-inner">
      <slot :indentStyle="indentStyle"></slot>
    </div>
  </div>
  <tr v-else class="tree-node" ref="el">
    <slot :indentStyle="indentStyle"></slot>
  </tr>
</template>

<script>
export default {
  props: ["stat", "rtl", "btt", "indent", "table", "treeLine", "treeLineOffset", "processor"],
  emits: ["open", "close", "check"],
  data() {
    return {
      justToggleOpen: false,
    };
  },
  computed: {
    indentStyle() {
      return {
        [!this.rtl ? "paddingLeft" : "paddingRight"]: this.indent * (this.stat.level - 1) + "px",
      };
    },
    vLines() {
      const lines = [];
      const hasNextVisibleNode = (stat) => {
        if (stat.parent) {
          let i = stat.parent?.children.indexOf(stat);
          do {
            i++
            let next = stat.parent.children[i]
            if (next) {
              if (!next.hidden) {
                return true
              }
            } else {
              break
            }
          } while (true);
        }
        return false
      }
      const leftOrRight = this.rtl ? 'right' : 'left'
      const bottomOrTop = this.btt ? 'top' : 'bottom'
      let current = this.stat
      while (current) {
        let left = (current.level - 2) * this.indent + this.treeLineOffset
        const hasNext = hasNextVisibleNode(current)
        const addLine = () => {
          lines.push({
            style: {
              [leftOrRight]: left + 'px',
              [bottomOrTop]: hasNext ? 0 : '50%',
            }
          })
        }
        if (current === this.stat) {
          if (current.level > 1) {
            addLine()
          }
        } else if (hasNext) {
          addLine()
        }
        current = current.parent
      }
      return lines
    },
    hLineStyle() {
      let left = (this.stat.level - 2) * this.indent + this.treeLineOffset
      const leftOrRight = this.rtl ? 'right' : 'left'
      return {
        [leftOrRight]: left + 'px',
      }
    }
  },
  watch: {
    'stat.checked': function (checked) {
      if (this.justToggleOpen) {
        return
      }
      if (this.processor.afterOneCheckChanged(this.stat)) {
        this.$emit("check", this.stat);
      }
    },
    'stat.open': function (open) {
      if (this.justToggleOpen) {
        return
      }
      if (open) {
        this.$emit("open", this.stat);
      } else {
        this.$emit("close", this.stat);
      }
      this.afterToggleOpen()
    }
  },
  methods: {
    afterToggleOpen() {
      this.justToggleOpen = true
      setTimeout(() => {
        this.justToggleOpen = false
      }, 100)
    }
  }
};
</script>


<style>
/* tree line start */
.tree-node--with-tree-line {
  position: relative;
}

.tree-line {
  position: absolute;
  background-color: #bbbbbb;
}

.tree-vline {
  width: 1px;
  top: 0;
  bottom: 0;
}

.tree-hline {
  height: 1px;
  top: 50%;
  width: 10px;
}



/* tree line end */
</style>