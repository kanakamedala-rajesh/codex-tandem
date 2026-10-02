// Fixed harmless G0 child: no credentials, filesystem writes or network access.
const args=process.argv.slice(2);
process.stdout.write(JSON.stringify({args})+'\n');
process.stderr.write('G0 harmless child\n');
if(args.includes('--fixture-wait')) {
 process.on('SIGINT',()=>process.exit(130));
 process.on('SIGTERM',()=>process.exit(143));
 setInterval(()=>{},1000);
} else if(args.includes('--fixture-no-stdin')){ process.exitCode=0; } else {
 process.stdin.pipe(process.stdout);
 process.stdin.on('end',()=>{const value=args.find(a=>/^--fixture-exit=\d+$/.test(a));process.exitCode=value?Math.min(255,Number(value.split('=')[1])):0;});
}

