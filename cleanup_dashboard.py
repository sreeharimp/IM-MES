import os
path = r'd:\IMMC v0.2\src\components\AdminDashboard.tsx'
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Precise replacement for the test print button
    old_code = """                    onClick={async () => {
                      const method = localStorage.getItem('print_method') || 'system';
                      const testText = \"--------------------------------\\n      IM-MES TEST PRINT\\n--------------------------------\\nDEVICE: UROVO i9100\\nTIME: \" + new Date().toLocaleString() + \"\\nSTATUS: DIRECT CONNECTED\\n[QRCODE:TEST-QR-123]\\n--------------------------------\\n\\n\\n\\n\\n\";
                      const isNative = Capacitor.getPlatform() !== 'web';
                      
                      if (method === 'urovo' && isNative) {
                         const NativePrinter = registerPlugin<any>('PrinterPlugin');
                         await NativePrinter.printUrovo({ text: testText });
                         showSuccess(\"Direct Urovo command sent!\");
                      } else if (method === 'rawbt' && isNative) {
                         const NativePrinter = registerPlugin<any>('PrinterPlugin');
                         await NativePrinter.printRawBT({ data: btoa(testText) });
                         showSuccess(\"RawBT command sent!\");
                      } else {
                         window.print();
                         showSuccess(\"System print triggered\");
                      }
                    }}"""

    new_code = """                    onClick={async () => {
                      try {
                        const method = localStorage.getItem('print_method') || 'system';
                        const testText = \"--------------------------------\\n      IM-MES TEST PRINT\\n--------------------------------\\nDEVICE: UROVO i9100\\nTIME: \" + new Date().toLocaleString() + \"\\nSTATUS: DIRECT CONNECTED\\n[QRCODE:TEST-QR-123]\\n--------------------------------\\n\\n\\n\\n\\n\";
                        const isNative = Capacitor.getPlatform() !== 'web';
                        
                        if (method === 'urovo' && isNative) {
                           const NativePrinter = registerPlugin<any>('PrinterPlugin');
                           await NativePrinter.printUrovo({ text: testText });
                           showSuccess(\"Direct Urovo command sent!\");
                        } else if (method === 'rawbt' && isNative) {
                           const NativePrinter = registerPlugin<any>('PrinterPlugin');
                           await NativePrinter.printRawBT({ data: btoa(testText) });
                           showSuccess(\"RawBT command sent!\");
                        } else {
                           window.print();
                           showSuccess(\"System print triggered\");
                        }
                      } catch (e) {
                        alert(\"Print Failed: \" + e.message);
                      }
                    }}"""
    
    if old_code in content:
        content = content.replace(old_code, new_code)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Final injection successful")
    else:
        # Fallback to a simpler match if whitespace is the issue
        print("Old code not found exactly, trying fuzzy match...")
        if 'onClick={async () => {' in content:
             print("Found onClick start, but full block didn't match.")
        
    print("Cleanup/Injection finished")
else:
    print("File not found")
