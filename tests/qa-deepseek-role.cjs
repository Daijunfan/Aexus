// Reuse the established real-engine Company/Messages/Plan fixture, with isolated output.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),out=process.env.QA_DEEPSEEK_OUT||path.join(root,'artifacts/full-acceptance-20261015/deepseek');
process.env.CLOUD_HOSTS_TEST_BACKEND ||= path.join(root,'artifacts/Aexus.app/Contents/Resources/backend');
let source=fs.readFileSync(path.join(__dirname,'role-board-deepseek-live.cjs'),'utf8')
 .replace("path.resolve(__dirname,'../artifacts/role-board-acceptance/deep-20261015')",JSON.stringify(out))
 .replace('timeout=180000','timeout=100000')
 .replace("const report={passed:false", "const release=JSON.parse(fs.readFileSync(path.join(backend,'release.json')));if(process.env.QA_FINAL_BUILD_ID&&release.buildId!==process.env.QA_FINAL_BUILD_ID)throw Error('Candidate identity changed before Role run');const report={backend,version:release.version,buildId:release.buildId,finalCandidate:!!process.env.QA_FINAL_BUILD_ID,passed:false")
 .replace('report.passed=true;',"fs.writeFileSync(path.join(out,'role-final-evidence.json'),JSON.stringify({...await inspect(),group:await history(),plan:await call('schedule.get',{id:job.id}),runs:await call('schedule.history',{id:job.id})},null,2),{mode:0o600});report.passed=true;");
const fixture=new Module(path.join(__dirname,'role-board-deepseek-live.cjs'),module);fixture.filename=path.join(__dirname,'role-board-deepseek-live.cjs');fixture.paths=module.paths;fixture._compile(source,fixture.filename);
