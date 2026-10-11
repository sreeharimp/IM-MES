package com.im.shopfloor.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.im.shopfloor.data.model.Machine
import com.im.shopfloor.ui.ShopFloorUiState
import com.im.shopfloor.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MachineDetailScreen(
    machine: Machine,
    uiState: ShopFloorUiState,
    onBack: () -> Unit,
    onLogBin: (startupScrap: Int, qcSample: Int) -> Unit,
    onReportBreakdown: (reason: String, remarks: String) -> Unit,
    onResolveBreakdown: (breakdownId: String) -> Unit,
    onAssignOperator: (operatorId: String) -> Unit,
    onVerifyMaterial: (barcode: String) -> Unit
) {
    var showBreakdownDialog by remember { mutableStateOf(false) }
    var showAssignDialog by remember { mutableStateOf(false) }
    var showMaterialScanDialog by remember { mutableStateOf(false) }
    var startupScrapText by remember { mutableStateOf("0") }
    var qcSampleText by remember { mutableStateOf("0") }

    val product = uiState.products.find { it.id == machine.currentProductId }
    val mould = uiState.moulds.find { it.id == machine.currentMouldId }
    val operator = uiState.operators.find { it.id == machine.currentOperatorId }
    val machineCrates = uiState.crates.filter { it.machineId == machine.id }
    val activeBreakdown = uiState.activeBreakdowns.find { it.machineId == machine.id }

    val isBreakdown = machine.status.equals("Maintenance", ignoreCase = true) ||
            machine.status.equals("Breakdown", ignoreCase = true) ||
            activeBreakdown != null

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = machine.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = TextPrimary
                        )
                    }
                },
                actions = {
                    // Status Pill
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (isBreakdown) StatusBreakdownBg else if (machine.status.equals("Running", ignoreCase = true)) StatusRunningBg else StatusIdleBg,
                        modifier = Modifier.padding(end = 12.dp)
                    ) {
                        Text(
                            text = if (isBreakdown) "BREAKDOWN" else machine.status.uppercase(),
                            color = if (isBreakdown) StatusBreakdown else if (machine.status.equals("Running", ignoreCase = true)) StatusRunning else StatusIdle,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = DarkBackground)
            )
        },
        containerColor = DarkBackground
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Success / Error banners
            if (uiState.successMessage != null) {
                item {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = StatusRunningBg,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = uiState.successMessage,
                            color = Color.White,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }

            if (uiState.error != null) {
                item {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = StatusBreakdownBg,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = uiState.error,
                            color = Color.White,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }

            // 1. Current Job & Operator Card
            item {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = DarkSurface,
                    border = BorderStroke(1.dp, DarkBorder),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("PRODUCT ON MACHINE", style = MaterialTheme.typography.bodySmall, color = TextMuted)
                                Text(
                                    text = product?.name ?: "No Product Assigned",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = AccentCyan
                                )
                            }
                            if (product != null) {
                                Text(
                                    text = "Code: ${product.itemCode ?: "N/A"}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TextSecondary
                                )
                            }
                        }

                        HorizontalDivider(color = DarkBorder, thickness = 0.5.dp)

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("ACTIVE OPERATOR", style = MaterialTheme.typography.bodySmall, color = TextMuted)
                                Text(
                                    text = operator?.name ?: "Not Assigned",
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = TextPrimary
                                )
                            }
                            OutlinedButton(
                                onClick = { showAssignDialog = true },
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = PrimaryBlueLight),
                                border = BorderStroke(1.dp, PrimaryBlue)
                            ) {
                                Text("CHANGE", fontSize = 12.sp)
                            }
                        }

                        if (mould != null) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Mould: ${mould.name}", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                                Text("Cavities: ${mould.cavities} | Cycle: ${mould.cycleTime}s", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                            }
                        }
                    }
                }
            }

            // 2. Giant +1 Bin Action Card (Shop Floor Core Action)
            item {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = DarkSurface,
                    border = BorderStroke(1.5.dp, PrimaryBlue),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Text(
                            text = "BIN LOGGING & INSPECTION TRIGGER",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            OutlinedTextField(
                                value = startupScrapText,
                                onValueChange = { startupScrapText = it },
                                label = { Text("Startup Scrap", color = TextSecondary) },
                                modifier = Modifier.weight(1f),
                                singleLine = true,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = PrimaryBlue,
                                    unfocusedBorderColor = DarkBorder,
                                    focusedTextColor = TextPrimary,
                                    unfocusedTextColor = TextPrimary
                                )
                            )
                            OutlinedTextField(
                                value = qcSampleText,
                                onValueChange = { qcSampleText = it },
                                label = { Text("QC Sample Qty", color = TextSecondary) },
                                modifier = Modifier.weight(1f),
                                singleLine = true,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = PrimaryBlue,
                                    unfocusedBorderColor = DarkBorder,
                                    focusedTextColor = TextPrimary,
                                    unfocusedTextColor = TextPrimary
                                )
                            )
                        }

                        // Big Glove-Friendly Tactile Button
                        Button(
                            onClick = {
                                val scrap = startupScrapText.toIntOrNull() ?: 0
                                val sample = qcSampleText.toIntOrNull() ?: 0
                                onLogBin(scrap, sample)
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(64.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isBreakdown) StatusOff else StatusRunning,
                                contentColor = Color.White
                            ),
                            enabled = !isBreakdown
                        ) {
                            Icon(
                                imageVector = Icons.Default.AddBox,
                                contentDescription = null,
                                modifier = Modifier.size(28.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "LOG BIN COMPLETED (+1)",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp
                            )
                        }
                    }
                }
            }

            // 3. Quick Action Buttons Row (Breakdown & Material Scan)
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (isBreakdown) {
                        Button(
                            onClick = {
                                if (activeBreakdown?.id != null) {
                                    onResolveBreakdown(activeBreakdown.id)
                                }
                            },
                            modifier = Modifier
                                .weight(1f)
                                .height(52.dp),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = StatusRunning)
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("RESUME MACHINE", fontWeight = FontWeight.Bold)
                        }
                    } else {
                        Button(
                            onClick = { showBreakdownDialog = true },
                            modifier = Modifier
                                .weight(1f)
                                .height(52.dp),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = StatusBreakdown)
                        ) {
                            Icon(Icons.Default.Warning, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("BREAKDOWN", fontWeight = FontWeight.Bold)
                        }
                    }

                    OutlinedButton(
                        onClick = { showMaterialScanDialog = true },
                        modifier = Modifier
                            .weight(1f)
                            .height(52.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = AccentCyan),
                        border = BorderStroke(1.5.dp, AccentCyan)
                    ) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = null)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("VERIFY MAT", fontWeight = FontWeight.Bold)
                    }
                }
            }

            // 4. Crates History Header
            item {
                Text(
                    text = "Shift Bins (${machineCrates.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
            }

            // 5. Crates History List
            if (machineCrates.isEmpty()) {
                item {
                    Text(
                        text = "No bins logged for this machine during the current shift.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextMuted,
                        modifier = Modifier.padding(vertical = 12.dp)
                    )
                }
            } else {
                items(machineCrates) { crate ->
                    CrateHistoryItem(crate = crate)
                }
            }

            item {
                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }

    // Dialogs
    if (showBreakdownDialog) {
        BreakdownDialog(
            machineName = machine.name,
            reasons = uiState.breakdownReasons,
            onDismiss = { showBreakdownDialog = false },
            onSubmit = { reason, remarks ->
                showBreakdownDialog = false
                onReportBreakdown(reason, remarks)
            }
        )
    }

    if (showAssignDialog) {
        AssignOperatorDialog(
            machineName = machine.name,
            currentOperatorId = machine.currentOperatorId,
            operators = uiState.operators,
            onDismiss = { showAssignDialog = false },
            onAssign = { opId ->
                showAssignDialog = false
                onAssignOperator(opId)
            }
        )
    }

    if (showMaterialScanDialog) {
        MaterialScanDialog(
            productName = product?.name ?: "Current Product",
            verificationResult = uiState.materialVerificationResult,
            onDismiss = { showMaterialScanDialog = false },
            onManualSubmit = { barcode ->
                if (product != null) {
                    onVerifyMaterial(barcode)
                }
            }
        )
    }
}

@Composable
fun CrateHistoryItem(crate: com.im.shopfloor.data.model.Crate) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = DarkSurface,
        border = BorderStroke(1.dp, DarkBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Bin #${crate.binNumber}",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Text(
                    text = "Net: ${crate.netQty} | Scrap: ${crate.startupScrap} | QC: ${crate.qcSample}",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
            }

            Surface(
                shape = RoundedCornerShape(6.dp),
                color = DarkSurfaceElevated
            ) {
                Text(
                    text = crate.status,
                    style = MaterialTheme.typography.bodySmall,
                    color = AccentCyan,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }
    }
}
