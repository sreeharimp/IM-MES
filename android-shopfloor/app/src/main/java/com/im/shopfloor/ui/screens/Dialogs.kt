package com.im.shopfloor.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.im.shopfloor.data.model.BreakdownReason
import com.im.shopfloor.data.model.Operator
import com.im.shopfloor.ui.theme.*

@Composable
fun BreakdownDialog(
    machineName: String,
    reasons: List<BreakdownReason>,
    onDismiss: () -> Unit,
    onSubmit: (reason: String, remarks: String) -> Unit
) {
    var selectedReason by remember { mutableStateOf(reasons.firstOrNull()?.name ?: "Mechanical Failure") }
    var remarks by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSurface,
        title = {
            Text(
                text = "Report Breakdown: $machineName",
                style = MaterialTheme.typography.titleLarge,
                color = StatusBreakdown,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Select Breakdown Category:",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary
                )

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 180.dp)
                ) {
                    items(if (reasons.isNotEmpty()) reasons.map { it.name } else listOf("Mechanical Failure", "Electrical Issue", "Mould Jam", "Raw Material Shortage", "Heating Sensor Error")) { reasonName ->
                        val isSelected = selectedReason == reasonName
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 3.dp)
                                .clickable { selectedReason = reasonName },
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSelected) StatusBreakdownBg else DarkSurfaceElevated,
                            border = if (isSelected) androidx.compose.foundation.BorderStroke(1.dp, StatusBreakdown) else null
                        ) {
                            Text(
                                text = reasonName,
                                color = if (isSelected) Color.White else TextPrimary,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = remarks,
                    onValueChange = { remarks = it },
                    label = { Text("Remarks / Operator Notes", color = TextSecondary) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = StatusBreakdown,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    )
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSubmit(selectedReason, remarks) },
                colors = ButtonDefaults.buttonColors(containerColor = StatusBreakdown)
            ) {
                Text("LOG BREAKDOWN", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("CANCEL", color = TextSecondary)
            }
        }
    )
}

@Composable
fun AssignOperatorDialog(
    machineName: String,
    currentOperatorId: String?,
    operators: List<Operator>,
    onDismiss: () -> Unit,
    onAssign: (operatorId: String) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSurface,
        title = {
            Text(
                text = "Assign Operator: $machineName",
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 280.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(operators) { op ->
                    val isSelected = currentOperatorId == op.id
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onAssign(op.id) },
                        shape = RoundedCornerShape(8.dp),
                        color = if (isSelected) PrimaryBlueVariant else DarkSurfaceElevated,
                        border = if (isSelected) androidx.compose.foundation.BorderStroke(1.dp, PrimaryBlueLight) else null
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
                                    text = op.name,
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = TextPrimary
                                )
                                Text(
                                    text = "ID: ${op.employeeId ?: "N/A"}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TextSecondary
                                )
                            }
                            if (isSelected) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = StatusRunning)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("CLOSE", color = TextSecondary)
            }
        }
    )
}

@Composable
fun MaterialScanDialog(
    productName: String,
    verificationResult: Pair<String, Boolean>?,
    onDismiss: () -> Unit,
    onManualSubmit: (barcode: String) -> Unit
) {
    var manualBarcode by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSurface,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = AccentCyan)
                Text("Verify Raw Material", style = MaterialTheme.typography.titleLarge, color = TextPrimary)
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "Product: $productName",
                    style = MaterialTheme.typography.bodyLarge,
                    color = AccentCyan,
                    fontWeight = FontWeight.Bold
                )

                Text(
                    text = "Scan material bag barcode with Zebra/Honeywell laser or enter ID manually:",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary
                )

                // Scan result indicator
                if (verificationResult != null) {
                    val (code, isValid) = verificationResult
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (isValid) StatusRunningBg else StatusBreakdownBg,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                if (isValid) Icons.Default.CheckCircle else Icons.Default.Error,
                                contentDescription = null,
                                tint = if (isValid) StatusRunning else StatusBreakdown
                            )
                            Column {
                                Text(
                                    text = if (isValid) "MATERIAL APPROVED" else "UNAUTHORIZED MATERIAL!",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Code: $code",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color.White.copy(alpha = 0.8f)
                                )
                            }
                        }
                    }
                }

                OutlinedTextField(
                    value = manualBarcode,
                    onValueChange = { manualBarcode = it },
                    label = { Text("Material Batch / Lot #", color = TextSecondary) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentCyan,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    )
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (manualBarcode.isNotBlank()) {
                        onManualSubmit(manualBarcode.trim())
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
            ) {
                Text("VERIFY", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("CLOSE", color = TextSecondary)
            }
        }
    )
}

@Composable
fun ShiftHandoverDialog(
    currentSupervisor: String,
    onDismiss: () -> Unit,
    onSubmitHandover: (newSupervisor: String) -> Unit
) {
    var newSupervisorName by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSurface,
        title = {
            Text("Shift Handover Sign-Off", style = MaterialTheme.typography.titleLarge, color = TextPrimary)
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Current Supervisor On Duty: $currentSupervisor",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary
                )

                OutlinedTextField(
                    value = newSupervisorName,
                    onValueChange = { newSupervisorName = it },
                    label = { Text("Relieving Supervisor Full Name", color = TextSecondary) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PrimaryBlue,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    )
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (newSupervisorName.isNotBlank()) {
                        onSubmitHandover(newSupervisorName.trim())
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
            ) {
                Text("CONFIRM HANDOVER", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("CANCEL", color = TextSecondary)
            }
        }
    )
}
