/** 
 * idb.js
 * 使用indexDB方式存储数据，以减少服务器压力
 * 常见用法
 * 设置数据 idb('库名').setDB()
 * 查询数据 idb('库名' || []).query('查询的值')
 * 指定的查询参数 idb('库名' || []).where({'指定的查询参数'}).query('查询的值').then(res => {res.data})
 * 删除数据库 idb('库名').delDB()
 * 通过itemCode反查符合的数据 idb('库名').match([]).then(res => {res})
 */

// TODO 缺失功能
// 1、某个表内数据更新(删除并整体更新)
// 2、针对不同的表加不同的索引
// 3、需要增加设置索引，并根据设定好的索引进行查询，此方法可能可以优化query与match的部分逻辑

const idb = function (dbName, sheetName) {
  return new idb.fn.init(dbName, sheetName);
};

idb.fn = idb.prototype = {
  constructor: idb,
  dbName: "", // 两种类型 字符串或数组
  sheetName: "",
  queryParams: null,

  // 获取版本号
  getVersion: function () {
    if (Array.isArray(this.dbName)) {
      return alert('仅query支持多库查询，此方法只能查询单个库！');
    }
    const request = window.indexedDB.open(this.dbName);

    return new Promise((resolve) => {
      request.onsuccess = function (e) {
        const version = e.target.result.version;
        resolve(version);
      };
    });
  },

  // 获取数据库整体数据
  getDB: function () {},

  /**
   * 存储数据方法
   *
   * @param {Array} data 必填，添加的数据
   * @return {*}
   */
  setDB: function (data) {
    if (Array.isArray(this.dbName)) {
      return alert('仅query支持多库查询，此方法只能查询单个库！');
    }
    const request = window.indexedDB.open(this.dbName, data.version);
    const dbName = this.dbName;
    const arr = data.data || [];
    const sheetName = this.sheetName;

    if (!Array.isArray(arr)) {
      throw "arr为你要存储的数据，必须是一个数组。";
    }

    request.onsuccess = function (e) {
      console.log(
        `%c 数据库 %c ${dbName} 连接成功 %c`,
        "background:#35495e ; padding: 1px; border-radius: 3px 0 0 3px;  color: #fff;font-size: 12px",
        "background:#41b883 ; padding: 1px; border-radius: 0 3px 3px 0;  color: #fff; font-size: 12px",
        "background:transparent"
      );
    };

    request.onupgradeneeded = function (e) {
      const db = e.target.result;
      const transaction = e.target.transaction;
      let objectStore;

      // 每次更新前先删除该表, 避免数据追加
      if (db.objectStoreNames.contains(sheetName)) {
        db.deleteObjectStore(sheetName)
      }

      // 没有表则创建数据表
      if (!db.objectStoreNames.contains(sheetName)) {
        objectStore = db.createObjectStore(sheetName, {
          autoIncrement: true,
        });
        // 创建索引 先写死后期优化
        objectStore.createIndex("itemCode", "itemCode");
        objectStore.createIndex("itemName", "itemName");
      }

      // 定义表
      let sheet = transaction.objectStore(sheetName);

      // 遍历索引为数据表添加值
      arr.map((item) => {
        sheet.add({
          itemCode: item.itemCode,
          itemName: item.itemName,
          value: item,
        });
      });

      // 每次更新后都要关闭一次，用来切换版本。
      db.close();
    };
  },

  /**
   * 删除当前数据库方法
   */
  delDB: function () {
    if (Array.isArray(this.dbName)) {
      return alert('仅query支持多库查询，此方法只能查询单个库！');
    }
    const dbName = this.dbName;
    const delDB = window.indexedDB.deleteDatabase(dbName);
    delDB.onsuccess = function () {
      console.log("删除数据库：" + dbName + "成功！");
    };

    delDB.onerror = function (e) {
      console.log("删除数据库：" + dbName + "失败！", e);
    };
  },

  /**
   * 清空表方法
   *
   * @param {string} sheet 必填 表名
   * @return {*}
   */
  clearSheet: function (sheet) {
    if (Array.isArray(this.dbName)) {
      return alert('仅query支持多库查询，此方法只能查询单个库！');
    }
    const request = window.indexedDB.open(this.dbName);
    const sheetName = sheet || this.sheetName;

    request.onsuccess = function (e) {
      const db = request.result;
      const transaction = db.transaction(sheetName, "readwrite");
      const store = transaction.objectStore(sheetName);
      const status = store.clear();
      status.onsuccess = function () {
        console.log("清空数据表：" + sheetName + "成功！");
      };
      status.onerror = function (e) {
        console.log("清空数据表：" + sheetName + "失败！", e);
      };
    };

    request.onerror = function (e) {
      console.log("清空数据表：" + sheetName + "失败！", e);
    };
  },

  // 设置数据库索引
  // setIndex: function () {
  //   const request = this.request;
  //   return this
  // },

  // 使用了where就必须传值，精准匹配
  // where方法可以多库查询
  where: function (obj) {
    this.queryParams = obj;
    return this;
  },

  /**
   * 查询数据方法
   *
   * @param {string number} keyword 必填 查询的值
   * @param {Boolean} pattern 选填 是否忽略大小写，默认忽略。不忽略请传true。
   * @return {Object}
   */
  query: function (keyword, pattern) {
    const _this = this;
    const sheetName = this.sheetName;
    // 如果传入的是单库，则转换成数组，以便后期遍历使用
    if (typeof (this.dbName) === 'string') {
      this.dbName = [this.dbName]
    }
    const result = {
      code: 200,
      data: [],
      msg: "数据获取成功！",
    };

    const rejResult = {
      code: 500,
      msg: "数据获取失败！",
    };

    const dbList = [];

    return new Promise(resolve => {
      this.dbName.map(dbName => {
        const item = new Promise((resolve) => {
          const request = window.indexedDB.open(dbName);

          request.onsuccess = function (e) {
            const db = e.target.result;
            // 如果查询的表存在
            if (db.objectStoreNames.contains(sheetName)) {
              const store = db
                .transaction(sheetName, "readonly")
                .objectStore(sheetName);
              // 目前默认查询索引是itemName
              const list = store.index("itemName").getAll();

              list.onsuccess = function (e) {
                let data = e.target.result;
                // 如果使用了where方法
                if (_this.queryParams) {
                  let queryKeys = Object.keys(_this.queryParams);
                  data = data.filter((item) => {
                    return queryKeys.every((ele) => {
                      return (
                        !_this.queryParams[ele] ||
                        item.value[ele] === _this.queryParams[ele]
                      );
                    });
                  });
                }
                data.map((item) => {
                  let itemName = item.itemName.toLocaleUpperCase();
                  let inputCode = item.value.inputCode ?
                    item.value.inputCode.toLocaleUpperCase() :
                    "";
                  let inputCodeWb = item.value.inputCodeWb ?
                    item.value.inputCode.toLocaleUpperCase() :
                    "";
                  let query =
                    typeof keyword === "string" ? keyword.toLocaleUpperCase() : "";

                  // 如果区分大小写
                  if (pattern) {
                    itemName = item.itemName;
                    inputCode = item.value.inputCode;
                    inputCodeWb = item.value.inputCodeWb;
                    query = keyword || "";
                  }

                  if (
                    itemName.includes(query) ||
                    inputCode.includes(query) ||
                    inputCodeWb.includes(query)
                  ) {
                    // 增加返回数据的字典类型
                    item.value.dbName = dbName;
                    result.data.push(item.value);
                  }
                });

                // 如果没有输入任何检索项目，则返回所有数据的前25条，否则则返回所有匹配项
                if (!keyword) {
                  result.data = result.data.splice(0, 25);
                }

                resolve(result)
              };

              list.onerror = function (e) {
                rejResult.data = e;
                resolve(rejResult)
              };
            } else {
              rejResult.data = e;
              resolve(rejResult)
            }

            // 每次查询后需要关闭数据库。
            db.close();
          };
        })
        dbList.push(item)
      });
      // 只是为了把所有的 Promise 都执行完，做一个统一的状态管理
      Promise.all(dbList).then(() => {
        resolve(result)
      });
    })
  },

  /**
   * 匹配单数据库内所有数据的方法
   *
   * @param {Array} codes 必填 需要匹配的itemCode数组
   * @return {Array}
   */
  match: function (codes) {
    if (Array.isArray(this.dbName)) {
      return alert('仅query支持多库查询，此方法只能查询单个库！');
    }
    const sheetName = this.sheetName;
    const request = window.indexedDB.open(this.dbName);
    return new Promise((resolve) => {
      request.onsuccess = function (e) {
        const db = e.target.result;
        // 如果查询的表存在
        if (
          db.objectStoreNames.contains(sheetName) &&
          Array.isArray(codes) &&
          codes.length > 0
        ) {
          const store = db
            .transaction(sheetName, "readonly")
            .objectStore(sheetName);
          // 通过itemCode匹配
          const list = store.index("itemCode").getAll();
          list.onsuccess = function (e) {
            let data = e.target.result.map((item) => {
              return item.value;
            });
            const result = data.filter((item) => {
              return codes.includes("" + item.itemCode);
            });
            resolve(result);
          };
        } else {
          alert("匹配值必须是一维数组，并且不能为空");
          resolve([]);
        }
      };
    });
  },
};

const init = (idb.fn.init = function (dbName, sheetName) {
  this.dbName = dbName;
  this.sheetName = sheetName || "dict";
  return this;
});

init.prototype = idb.fn;

export default idb;
