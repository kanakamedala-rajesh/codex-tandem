// Fixed harmless G0 child: no credentials, filesystem writes or network access.
import { createInterface } from 'node:readline';
const args=process.argv.slice(2);
const exitArgument=args.find(a=>/^--fixture-exit=\d+$/.test(a));
const requestedExit=exitArgument?Math.min(255,Number(exitArgument.split('=')[1])):0;
process.stdout.write(JSON.stringify({args})+'\n');
process.stderr.write('G0 harmless child\n');
if(args.includes('--fixture-wait')) {
 process.on('SIGINT',()=>process.exit(130));
 process.on('SIGTERM',()=>process.exit(143));
 setInterval(()=>{},1000);
} else if(args.includes('--fixture-read-line')) {
 const lines=createInterface({input:process.stdin,terminal:false});
 lines.once('line',line=>{
  process.stdout.write('INPUT:'+JSON.stringify({line})+'\n');
  lines.close();process.stdin.pause();process.exitCode=requestedExit;
 });
} else if(args.includes('--fixture-no-stdin')){ process.exitCode=requestedExit; } else {
 process.stdin.pipe(process.stdout);
 process.stdin.on('end',()=>{process.exitCode=requestedExit;});
}

