import test from "node:test";
import assert from "node:assert/strict";
import { isCodexPageTarget } from "../src/cdp.mjs";
test("只接受本机 app:// 页面 target",()=>{
  assert.equal(isCodexPageTarget({type:"page",url:"app://-/index.html",webSocketDebuggerUrl:"ws://127.0.0.1:9229/devtools/page/abc"}),true);
  assert.equal(isCodexPageTarget({type:"page",url:"https://example.com",webSocketDebuggerUrl:"ws://127.0.0.1:9229/devtools/page/abc"}),false);
  assert.equal(isCodexPageTarget({type:"page",url:"app://-/index.html",webSocketDebuggerUrl:"ws://example.com/devtools/page/abc"}),false);
  assert.equal(isCodexPageTarget({type:"page",url:"app://-/index.html",webSocketDebuggerUrl:"ws://127.0.0.1:9230/devtools/page/abc"},9229),false);
  assert.equal(isCodexPageTarget({type:"page",url:"app://-/index.html",webSocketDebuggerUrl:"ws://127.0.0.1:9229/devtools/browser/abc"},9229),false);
});
