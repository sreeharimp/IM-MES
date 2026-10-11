package com.im.shopfloor.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.im.shopfloor.data.model.Machine
import com.im.shopfloor.ui.ShopFloorUiState
import com.im.shopfloor.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MachineListScreen(
    uiState: ShopFloorUiState,
    onSelectMachine: (String) -> Unit,
    onRefresh: () -> Unit,
    onHandoverClick: () -> Unit,
    onLogoutClick: () -> Unit
) {
    var statusFilter by remember { mutableStateOf("ALL") }

    val filteredMachines = remember(uiState.machines, statusFilter) {
        when (statusFilter) {
            "RUNNING" -> uiState.machines.filter { it.status.equals("Running", ignoreCase = true) }
            "IDLE" -> uiState.machines.filter { it.status.equals("Idle", ignoreCase = true) }
            "ALERT" -> uiState.machines.filter {
                it.status.equals("Maintenance", ignoreCase = true) ||
                it.status.equals("Breakdown", ignoreCase = true) ||
                it.status.equals("Off", ignoreCase = true)
            }
            else -> uiState.machines
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Shop Floor Overview",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // Active Shift Badge
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = PrimaryBlueVariant
                            ) {
                                Text(
                                    text = uiState.currentShift,
                                    color = Color.White,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                            // Supervisor Badge
                            Text(
                                text = "Sup: ${uiState.activeSupervisor}",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onHandoverClick) {
                        Icon(Icons.Default.SwapHoriz, contentDescription = "Shift Handover", tint = AccentCyan)
                    }
                    IconButton(onClick = onRefresh) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = TextPrimary)
                    }
                    IconButton(onClick = onLogoutClick) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sign Out", tint = TextSecondary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = DarkBackground
                )
            )
        },
        containerColor = DarkBackground
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp)
        ) {
            // Status Filters Row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val runningCount = uiState.machines.count { it.status.equals("Running", ignoreCase = true) }
                val idleCount = uiState.machines.count { it.status.equals("Idle", ignoreCase = true) }
                val alertCount = uiState.machines.size - runningCount - idleCount

                FilterChipItem(
                    label = "All (${uiState.machines.size})",
                    isSelected = statusFilter == "ALL",
                    onClick = { statusFilter = "ALL" },
                    activeColor = PrimaryBlue
                )
                FilterChipItem(
                    label = "Run ($runningCount)",
                    isSelected = statusFilter == "RUNNING",
                    onClick = { statusFilter = "RUNNING" },
                    activeColor = StatusRunning
                )
                FilterChipItem(
                    label = "Idle ($idleCount)",
                    isSelected = statusFilter == "IDLE",
                    onClick = { statusFilter = "IDLE" },
                    activeColor = StatusIdle
                )
                FilterChipItem(
                    label = "Alert ($alertCount)",
                    isSelected = statusFilter == "ALERT",
                    onClick = { statusFilter = "ALERT" },
                    activeColor = StatusBreakdown
                )
            }

            // Notification / Banner if sync
            if (uiState.isLoading) {
                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp),
                    color = PrimaryBlue
                )
            }

            // Machine Grid
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 160.dp),
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                items(filteredMachines) { machine ->
                    val product = uiState.products.find { it.id == machine.currentProductId }
                    val operator = uiState.operators.find { it.id == machine.currentOperatorId }
                    val crateCount = uiState.crates.count { it.machineId == machine.id }

                    MachineCard(
                        machine = machine,
                        productName = product?.name ?: "No Job Assigned",
                        operatorName = operator?.name ?: "Unassigned",
                        crateCount = crateCount,
                        onClick = { onSelectMachine(machine.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun FilterChipItem(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    activeColor: Color
) {
    Surface(
        modifier = Modifier.clickable { onClick() },
        shape = RoundedCornerShape(8.dp),
        color = if (isSelected) activeColor.copy(alpha = 0.2f) else DarkSurface,
        border = BorderStroke(1.dp, if (isSelected) activeColor else DarkBorder)
    ) {
        Text(
            text = label,
            color = if (isSelected) activeColor else TextSecondary,
            fontSize = 13.sp,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
}

@Composable
fun MachineCard(
    machine: Machine,
    productName: String,
    operatorName: String,
    crateCount: Int,
    onClick: () -> Unit
) {
    val (statusColor, statusBg) = when (machine.status.lowercase()) {
        "running" -> StatusRunning to StatusRunningBg
        "idle" -> StatusIdle to StatusIdleBg
        "maintenance", "breakdown" -> StatusBreakdown to StatusBreakdownBg
        else -> StatusOff to DarkSurfaceElevated
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        color = DarkSurface,
        border = BorderStroke(1.dp, DarkBorder)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Header: Machine Name & Status Dot
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = machine.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )

                // Status Badge
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = statusBg
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .background(statusColor, CircleShape)
                        )
                        Text(
                            text = machine.status.uppercase(),
                            color = statusColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Product Name
            Text(
                text = productName,
                style = MaterialTheme.typography.bodyMedium,
                color = AccentCyan,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            HorizontalDivider(color = DarkBorder, thickness = 0.5.dp)

            // Operator Info
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null,
                    tint = TextMuted,
                    modifier = Modifier.size(16.dp)
                )
                Text(
                    text = operatorName,
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Bins Logged Counter
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Bins Shift:",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted
                )
                Text(
                    text = "$crateCount Bins",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
            }
        }
    }
}
