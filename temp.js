
const fs = require("fs");
let content = fs.readFileSync("c:/Tienda/app/(store)/(client)/index.tsx", "utf8");
let renderMethod = content.indexOf("return (\\n            <View style={[\\n                styles.productCard,");
if (renderMethod === -1) renderMethod = content.indexOf("return (\r\n            <View style={[\r\n                styles.productCard,");
console.log(content.substring(renderMethod + 5500, renderMethod + 7500));

