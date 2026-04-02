$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
cd android
./gradlew.bat assembleDebug --no-daemon --no-configuration-cache --stacktrace > ../build_results_v2.log 2>&1
