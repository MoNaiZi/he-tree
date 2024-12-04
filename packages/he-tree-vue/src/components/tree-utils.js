import * as hp from "helper-js";
export const CHILDREN = "children"; // inner childrenKey

/**
 * help to handle tree data. 帮助处理树形数据.
 */
export function makeTreeProcessor(data, opt = {}) {
  const opt2 = opt;
  const utilsBase = {
    ...defaultOptions,
    ...opt2,
    data,
    stats: null,
    statsFlat: null,
    _statsMap: null,
    initialized: false,
    init() {
      const { data, childrenKey } = this;
      const td = new hp.TreeData([]);
      this._statsMap = new Map();
      hp.walkTreeData(
        data,
        (nodeData, index, parent, path) => {
          const stat = this.statHandler({
            ...statDefault(),
            data: nodeData,
            open: Boolean(this.defaultOpen),
            parent: td.getParent(path),
            children: [],
            level: path.length,
          });
          //   console.log("path", path);
          this._statsMap.set(nodeData, stat);
          td.set(path, stat);
        },
        { childrenKey }
      );
      const statsFlat = [];
      td.walk((stat) => {
        statsFlat.push(stat);
      });
      this.stats = this.statsHandler(td.rootChildren);
      this.statsFlat = this.statsFlatHandler(statsFlat);
      this.initialized = true;
    },
    getStat(nodeData) {
      let r = this._statsMap.get(nodeData);
      if (!r) {
        throw new StatNotFoundError(`Stat not found`);
      }
      return r;
    },
    has(nodeData) {
      if (nodeData["isStat"]) {
        return this.statsFlat.indexOf(nodeData) > -1;
      } else {
        try {
          let r = this.getStat(nodeData);
          return Boolean(r);
        } catch (error) {
          if (error instanceof StatNotFoundError) {
            return false;
          }
          throw error;
        }
      }
    },
    _getPathByStat(stat) {
      if (stat == null) {
        return [];
      }
      const siblings = this.getSiblings(stat);
      const index = siblings.indexOf(stat);
      return [...(stat.parent ? this._getPathByStat(stat.parent) : []), index];
    },
    afterOneCheckChanged(stat) {
      const { checked } = stat;
      if (stat._ignoreCheckedOnce) {
        delete stat._ignoreCheckedOnce;
        return false;
      }

      const checkParent = (stat) => {
        const { parent } = stat;
        if (parent) {
          let hasChecked;
          let hasUnchecked;
          let hasHalfChecked;
          for (const child of parent.children) {
            if (child.checked) {
              hasChecked = true;
            } else if (child.checked === 0) {
              hasHalfChecked = true;
            } else {
              hasUnchecked = true;
            }
          }
          const parentChecked = hasHalfChecked
            ? 0
            : !hasUnchecked
            ? true
            : hasChecked
            ? 0
            : false;

          if (parent.checked !== parentChecked) {
            this._ignoreCheckedOnce(parent);
            parent.checked = parentChecked;
          }
          checkParent(parent);
        }
      };
      checkParent(stat);

      hp.walkTreeData(
        stat.children,
        (child) => {
          if (child.checked !== checked) {
            this._ignoreCheckedOnce(child);
            child.checked = checked;
          }
        },
        { childrenKey: CHILDREN }
      );
      return true;
    },
    _ignoreCheckedOnce(stat) {
      stat._ignoreCheckedOnce = true;
      setTimeout(() => {
        if (stat._ignoreCheckedOnce) {
          stat._ignoreCheckedOnce = false;
        }
      }, 100);
    },
    isVisible(statOrNodeData) {
      const stat = statOrNodeData["isStat"]
        ? statOrNodeData
        : this.getStat(statOrNodeData);
      const walk = (stat) => {
        return !stat || (!stat.hidden && stat.open && walk(stat.parent));
      };
      return Boolean(!stat.hidden && walk(stat.parent));
    },
    updateCheck() {
      hp.walkTreeData(
        this.stats,
        (stat) => {
          if (stat.children && stat.children.length > 0) {
            const checked = stat.children.every((v) => v.checked);
            if (stat.checked !== checked) {
              this._ignoreCheckedOnce(stat);
              stat.checked = checked;
            }
          }
        },
        { childFirst: true, childrenKey: CHILDREN }
      );
    },
    getChecked(withDemi = false) {
      return this.statsFlat.filter((v) => {
        return v.checked || (withDemi && v.checked === 0);
      });
    },
    getUnchecked(withDemi = true) {
      return this.statsFlat.filter((v) => {
        return withDemi ? !v.checked : v.checked === false;
      });
    },
    openAll() {
      for (const stat of this.statsFlat) {
        stat.open = true;
      }
    },
    closeAll() {
      for (const stat of this.statsFlat) {
        stat.open = false;
      }
    },
    openNodeAndParents(nodeOrStat) {
      const stat = nodeOrStat["isStat"] ? nodeOrStat : this.getStat(nodeOrStat);
      for (const parentStat of this.iterateParent(stat, { withSelf: true })) {
        parentStat.open = true;
      }
    },
    _calcFlatIndex(parent, index) {
      let flatIndex = parent ? this.statsFlat.indexOf(parent) + 1 : 0;
      const siblings = parent ? parent.children : this.stats;
      for (let i = 0; i < index; i++) {
        flatIndex += this._count(siblings[i]);
      }
      return flatIndex;
    },
    add(nodeData, parent = null, index = null) {
      if (this.has(nodeData)) {
        throw `Can't add because data exists in tree`;
      }
      const siblings = parent ? parent.children : this.stats;
      if (index == null) {
        index = siblings.length;
      }
      const stat = this.statHandler({
        ...statDefault(),
        open: Boolean(this.defaultOpen),
        data: nodeData,
        parent: parent || null,
        children: [],
        level: parent ? parent.level + 1 : 1,
      });
      this._setPosition(stat, parent || null, index);
      const children = nodeData[this.childrenKey];
      if (children) {
        const childrenSnap = children.slice();
        for (const child of childrenSnap) {
          this.add(child, stat);
        }
      }
    },
    remove(stat) {
      const siblings = this.getSiblings(stat);
      if (siblings.includes(stat)) {
        hp.arrayRemove(siblings, stat);
        const stats = this._flat(stat);
        this.statsFlat.splice(this.statsFlat.indexOf(stat), stats.length);
        for (const stat of stats) {
          this._statsMap.delete(stat.data);
        }
        this.afterRemoveStat(stat);
        return true;
      }
      return false;
    },
    getSiblings(stat) {
      const { parent } = stat;
      return parent ? parent.children : this.stats;
    },
    _setPosition(stat, parent, index) {
      const siblings = parent ? parent.children : this.stats;
      siblings.splice(index, 0, stat);
      stat.parent = parent;
      stat.level = parent ? parent.level + 1 : 1;
      const flatIndex = this._calcFlatIndex(parent, index);
      const stats = this._flat(stat);
      this.statsFlat.splice(flatIndex, 0, ...stats);
      for (const stat of stats) {
        if (!this._statsMap.has(stat.data)) {
          this._statsMap.set(stat.data, stat);
        }
      }
      hp.walkTreeData(
        stat,
        (node, index, parent) => {
          if (parent) {
            node.level = parent.level + 1;
          }
        },
        { childrenKey: CHILDREN }
      );
      this.afterSetStat(stat, parent, index);
    },
    *iterateParent(stat, opt = { withSelf: false }) {
      let t = opt.withSelf ? stat : stat.parent;
      while (t) {
        yield t;
        t = t.parent;
      }
    },
    move(stat, parent, index) {
      if (this.has(stat)) {
        if (
          stat.parent === parent &&
          this.getSiblings(stat).indexOf(stat) === index
        ) {
          return false;
        }
        if (stat === parent) {
          throw new Error(`Can't move node to it self`);
        }
        if (parent && stat.level < parent.level) {
          let t;
          for (const item of this.iterateParent(parent)) {
            if (item.level === stat.level) {
              t = item;
              break;
            }
          }
          if (stat === t) {
            throw new Error(`Can't move node to its descendant`);
          }
        }
        this.remove(stat);
      }
      this._setPosition(stat, parent, index);
      return true;
    },
    _flat(stat) {
      const r = [];
      hp.walkTreeData(
        stat,
        (child) => {
          r.push(child);
        },
        { childrenKey: CHILDREN }
      );
      return r;
    },
    _count(stat) {
      return this._flat(stat).length;
    },
    getData(filter, root) {
      const { childrenKey } = this;
      const td = new hp.TreeData([]);
      td.childrenKey = childrenKey;
      hp.walkTreeData(
        root || this.stats,
        (stat, index, parent, path) => {
          let newData = { ...stat.data, [childrenKey]: [] };
          if (filter) {
            newData = filter(newData);
          }
          td.set(path, newData);
        },
        {
          childrenKey: CHILDREN,
        }
      );
      return td.data;
    },
  };

  const utils = utilsBase;
  if (!utilsBase.noInitialization) {
    utils.init();
  }
  return utils;
}

export const defaultOptions = {
  childrenKey: "children",
  defaultOpen: false,
  statsHandler(stats) {
    return stats;
  },
  statsFlatHandler(statsFlat) {
    return statsFlat;
  },
  afterSetStat(stat, parent, index) {},
  afterRemoveStat(stat) {},
  statHandler(stat) {
    return stat;
  },
};

export function statDefault() {
  return {
    isStat: true,
    hidden: false,
    checked: false,
    style: null,
    class: null,
    draggable: null,
    droppable: null,
  };
}

class StatNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "StatNotFoundError";
  }
}
