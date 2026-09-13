import os
path = r'd:\IMMC v0.2\src\components\AdminDashboard.tsx'
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Simple replacement to force an alert at the start of the click handler
    content = content.replace('onClick={async () => {', 'onClick={async () => { alert("DEBUG: Test Print Button Clicked!"); ')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Injected alert into AdminDashboard.tsx")
else:
    print("File not found")
