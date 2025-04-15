const fs = require('fs');
const path = require('path');

// 需要检查的关键文件
const requiredFiles = [
  'dist/index.js',
  'dist/server/index.js',
  'dist/client/index.js',
  'dist/server/mysql-manager.js',
  'dist/client/MySQLConnectionList.js'
];

console.log('验证构建结果...');
let allFilesExist = true;

// 检查所有必需文件
requiredFiles.forEach(file => {
  const filePath = path.resolve(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ 文件存在: ${file}`);
    
    // 额外检查文件内容
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.length > 0) {
      console.log(`  - 文件大小: ${(content.length / 1024).toFixed(2)} KB`);
    } else {
      console.error(`  - ❌ 警告: 文件为空!`);
      allFilesExist = false;
    }
  } else {
    console.error(`❌ 文件缺失: ${file}`);
    allFilesExist = false;
  }
});

// 检查dist目录中的文件总数
const countFilesInDir = (dir) => {
  let count = 0;
  let files = [];
  
  try {
    files = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    console.error(`❌ 无法读取目录 ${dir}: ${error.message}`);
    return 0;
  }
  
  files.forEach(file => {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      count += countFilesInDir(fullPath);
    } else {
      count += 1;
    }
  });
  
  return count;
};

const totalFiles = countFilesInDir(path.resolve(__dirname, 'dist'));
console.log(`\n总共生成了 ${totalFiles} 个文件`);

// 输出目录结构
const printDirStructure = (dir, level = 0) => {
  if (level === 0) {
    console.log('\n目录结构:');
  }
  
  const indent = '  '.repeat(level);
  const dirPath = path.resolve(__dirname, dir);
  
  try {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    
    if (level === 0 || files.length > 0) {
      console.log(`${indent}${dir}/`);
    }
    
    files.forEach(file => {
      const relativePath = path.join(dir, file.name);
      if (file.isDirectory()) {
        printDirStructure(relativePath, level + 1);
      } else {
        console.log(`${indent}  ${file.name}`);
      }
    });
  } catch (error) {
    console.error(`${indent}❌ 无法读取目录 ${dir}: ${error.message}`);
  }
};

// 打印前三级目录结构
printDirStructure('dist', 0);

if (allFilesExist) {
  console.log('\n✅ 构建验证通过!');
} else {
  console.error('\n❌ 构建验证失败! 一些关键文件缺失或为空.');
  
  // 提供一些修复建议
  console.log('\n修复建议:');
  console.log('1. 确保所有的 TypeScript 配置文件 (tsconfig*.json) 中的路径设置正确');
  console.log('2. 检查 src/index.ts 文件是否正确导入和导出了 server 和 client');
  console.log('3. 检查构建脚本是否按正确顺序执行了所有步骤');
  console.log('4. 尝试手动创建丢失的目录 (如 dist/server, dist/client)');
  
  process.exit(1);
}