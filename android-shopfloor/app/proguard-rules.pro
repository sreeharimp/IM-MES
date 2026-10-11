# ProGuard / R8 rules for IM-MES Native Android Shop Floor App
# Keeps serializable models and ML Kit / Ktor classes intact while stripping unused code

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Kotlinx Serialization
-keepclassmembers class * {
    *** Companion;
}
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,allowobfuscation,allowshrinking class * {
    @kotlinx.serialization.Serializable class *;
}
-keepclassmembers class * {
    @kotlinx.serialization.SerialName <fields>;
}

# Ktor
-keep class io.ktor.** { *; }

# ML Kit
-keep class com.google.mlkit.** { *; }
