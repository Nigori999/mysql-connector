const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// 确保dist目录存在
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 编译TypeScript
console.log('编译TypeScript...');
exec('npx tsc', (error, stdout, stderr) => {
  if (error) {
    console.error(`TypeScript 编译报错: ${error}`);
    return;
  }
  console.log('TypeScript 编译成功');
  
  console.log('复制必要的静态文件...');
  
  // 复制package.json到dist目录
  const packageJson = require('./package.json');
  const distPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    main: 'server/index.js',
    module: 'client/index.jsx',
    dependencies: packageJson.dependencies,
    peerDependencies: packageJson.peerDependencies,
    nocobase: packageJson.nocobase
  };
  
  fs.writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify(distPackageJson, null, 2)
  );
  
  console.log('编译完成!');
});