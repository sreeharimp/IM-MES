package com.im.shopfloor.ui.theme

import androidx.compose.ui.graphics.Color

// High-Contrast Industrial Dark Mode Colors
val DarkBackground = Color(0xFF0A0D12)       // Ultra-dark factory background (saves OLED battery)
val DarkSurface = Color(0xFF131822)          // Card container surface
val DarkSurfaceElevated = Color(0xFF1B2230)  // Elevated buttons / dialogs
val DarkBorder = Color(0xFF283347)           // High visibility borders

val PrimaryBlue = Color(0xFF2563EB)          // Industrial action blue
val PrimaryBlueLight = Color(0xFF3B82F6)
val PrimaryBlueVariant = Color(0xFF1D4ED8)

val StatusRunning = Color(0xFF10B981)        // Emerald Green (Machine Operating)
val StatusRunningBg = Color(0xFF064E3B)
val StatusIdle = Color(0xFFF59E0B)           // Amber (Machine Idle / Ready)
val StatusIdleBg = Color(0xFF78350F)
val StatusBreakdown = Color(0xFFEF4444)      // Vibrant Red (Breakdown / Alert)
val StatusBreakdownBg = Color(0xFF7F1D1D)
val StatusMaintenance = Color(0xFF8B5CF6)    // Purple (Tooling / Preventive Maint)
val StatusOff = Color(0xFF6B7280)            // Slate Gray (Machine Off)

val TextPrimary = Color(0xFFF9FAFB)          // Crisp white for high readability in dim shop floor
val TextSecondary = Color(0xFF94A3B8)        // Neutral slate
val TextMuted = Color(0xFF64748B)

val AccentCyan = Color(0xFF06B6D4)           // Cyan accent for QR / Barcode / Cycle time
val AccentYellow = Color(0xFFFBBF24)         // Quality alert yellow
