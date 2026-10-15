using System;
using System.Threading;
// Native, non-networked Coding Agent fixture used only by Windows smoke tests.
class TestAgentCli {
 static void Main(string[] args) {
  // Native TUIs handle Ctrl+C in raw-input mode; the smoke fixture must do so too.
  Console.TreatControlCAsInput=true;
  Console.CancelKeyPress+=(sender,e)=>{Console.WriteLine("CTRL_C_EVENT_RECEIVED");Console.Out.Flush();Environment.Exit(130);};
  Console.WriteLine("READY SESSION: "+String.Join(" ",args));
  Console.Out.Flush();
  while(true){
   if(Console.KeyAvailable){
    ConsoleKeyInfo key=Console.ReadKey(true);
    if(key.KeyChar=='\x03' || key.Key==ConsoleKey.C && (key.Modifiers&ConsoleModifiers.Control)!=0){
     Console.WriteLine("CTRL_C_KEY_RECEIVED");Console.Out.Flush();return;
    }
   }
   Thread.Sleep(80);
  }
 }
}
