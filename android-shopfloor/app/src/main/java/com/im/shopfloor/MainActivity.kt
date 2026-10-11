package com.im.shopfloor

import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.im.shopfloor.scanner.HardwareScannerReceiver
import com.im.shopfloor.ui.ShopFloorViewModel
import com.im.shopfloor.ui.screens.LoginScreen
import com.im.shopfloor.ui.screens.MachineDetailScreen
import com.im.shopfloor.ui.screens.MachineListScreen
import com.im.shopfloor.ui.screens.ShiftHandoverDialog
import com.im.shopfloor.ui.theme.DarkBackground
import com.im.shopfloor.ui.theme.ShopFloorTheme

class MainActivity : ComponentActivity() {

    private val scannerReceiver = HardwareScannerReceiver()

    private val viewModel: ShopFloorViewModel by viewModels {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val app = ShopFloorApp.instance
                return ShopFloorViewModel(app.supabaseClient, app.sessionManager) as T
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Register hardware barcode broadcast receiver (Zebra DataWedge & Honeywell)
        val filter = IntentFilter().apply {
            addAction("com.im.shopfloor.SCAN_ACTION")
            addAction("com.honeywell.decode.intent.action.DATA")
            addAction("android.intent.ACTION_DECODE_DATA")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(scannerReceiver, filter, RECEIVER_EXPORTED)
        } else {
            registerReceiver(scannerReceiver, filter)
        }

        setContent {
            ShopFloorTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = DarkBackground
                ) {
                    val uiState by viewModel.uiState.collectAsState()
                    var showHandoverDialog by remember { mutableStateOf(false) }

                    if (uiState.currentUser == null) {
                        LoginScreen(
                            uiState = uiState,
                            onLogin = { email, pass -> viewModel.login(email, pass) }
                        )
                    } else {
                        val selectedMachine = uiState.machines.find { it.id == uiState.selectedMachineId }
                        if (selectedMachine != null) {
                            MachineDetailScreen(
                                machine = selectedMachine,
                                uiState = uiState,
                                onBack = { viewModel.selectMachine(null) },
                                onLogBin = { scrap, qc ->
                                    viewModel.logBinCompleted(selectedMachine.id, scrap, qc)
                                },
                                onReportBreakdown = { reason, remarks ->
                                    viewModel.reportBreakdown(selectedMachine.id, reason, remarks)
                                },
                                onResolveBreakdown = { breakdownId ->
                                    viewModel.resolveBreakdown(breakdownId, selectedMachine.id)
                                },
                                onAssignOperator = { opId ->
                                    viewModel.assignOperator(selectedMachine.id, opId)
                                },
                                onVerifyMaterial = { barcode ->
                                    selectedMachine.currentProductId?.let { pId ->
                                        viewModel.verifyMaterialBarcode(pId, barcode)
                                    }
                                }
                            )
                        } else {
                            MachineListScreen(
                                uiState = uiState,
                                onSelectMachine = { machineId -> viewModel.selectMachine(machineId) },
                                onRefresh = { viewModel.refreshAll() },
                                onHandoverClick = { showHandoverDialog = true },
                                onLogoutClick = { viewModel.logout() }
                            )
                        }

                        if (showHandoverDialog) {
                            ShiftHandoverDialog(
                                currentSupervisor = uiState.activeSupervisor,
                                onDismiss = { showHandoverDialog = false },
                                onSubmitHandover = { newSupervisor ->
                                    showHandoverDialog = false
                                    viewModel.handoverShift(newSupervisor)
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(scannerReceiver)
        } catch (_: Exception) {
        }
    }
}
