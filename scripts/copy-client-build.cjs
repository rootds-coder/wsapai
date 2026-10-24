const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
fs.rmSync(path.join(root,'dist'),{recursive:true,force:true});
fs.cpSync(path.join(root,'client/dist'),path.join(root,'dist'),{recursive:true});
console.log('Frontend copied to root dist (Windows/Linux compatible).');
