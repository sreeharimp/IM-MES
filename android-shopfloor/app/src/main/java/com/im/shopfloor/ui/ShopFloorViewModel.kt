package com.im.shopfloor.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.im.shopfloor.data.api.SupabaseClient
import com.im.shopfloor.data.local.SessionManager
import com.im.shopfloor.data.model.*
import com.im.shopfloor.scanner.ScannerManager
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

data class ShopFloorUiState(
    val isLoading: Boolean = false,
    val isLoggingIn: Boolean = false,
    val currentUser: Profile? = null,
    val machines: List<Machine> = emptyList(),
    val products: List<Product> = emptyList(),
    val moulds: List<Mould> = emptyList(),
    val operators: List<Operator> = emptyList(),
    val shiftSettings: List<ShiftSetting> = emptyList(),
    val appSettings: AppSettings? = null,
    val currentShift: String = "Shift A",
    val activeSupervisor: String = "Supervisor On Duty",
    val crates: List<Crate> = emptyList(),
    val breakdownReasons: List<BreakdownReason> = emptyList(),
    val activeBreakdowns: List<BreakdownRecord> = emptyList(),
    val selectedMachineId: String? = null,
    val error: String? = null,
    val successMessage: String? = null,
    val materialVerificationResult: Pair<String, Boolean>? = null // Barcode to isValid
)

class ShopFloorViewModel(
    private val supabaseClient: SupabaseClient,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        ShopFloorUiState(
            currentUser = sessionManager.currentProfile.value
        )
    )
    val uiState: StateFlow<ShopFloorUiState> = _uiState.asStateFlow()

    init {
        // Observe scanner events
        viewModelScope.launch {
            ScannerManager.scannedCodes.collect { code ->
                onBarcodeScanned(code)
            }
        }

        if (sessionManager.isLoggedIn) {
            refreshAll()
        }
    }

    fun login(email: String, pass: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoggingIn = true, error = null) }
            val result = supabaseClient.signIn(email.trim(), pass)
            result.fold(
                onSuccess = { profile ->
                    _uiState.update {
                        it.copy(
                            isLoggingIn = false,
                            currentUser = profile,
                            error = null
                        )
                    }
                    refreshAll()
                },
                onFailure = { err ->
                    _uiState.update {
                        it.copy(
                            isLoggingIn = false,
                            error = err.message ?: "Invalid email or password"
                        )
                    }
                }
            )
        }
    }

    fun logout() {
        sessionManager.clearSession()
        _uiState.update {
            ShopFloorUiState(
                currentUser = null
            )
        }
    }

    fun refreshAll() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val machinesResult = supabaseClient.getMachines()
                val productsResult = supabaseClient.getProducts()
                val mouldsResult = supabaseClient.getMoulds()
                val operatorsResult = supabaseClient.getOperators()
                val shiftsResult = supabaseClient.getShiftSettings()
                val settingsResult = supabaseClient.getAppSettings()
                val reasonsResult = supabaseClient.getBreakdownReasons()
                val activeBreakdownsResult = supabaseClient.getActiveBreakdowns()
                val cratesResult = supabaseClient.getCrates(limit = 50)

                val machines = machinesResult.getOrDefault(emptyList())
                val products = productsResult.getOrDefault(emptyList())
                val moulds = mouldsResult.getOrDefault(emptyList())
                val operators = operatorsResult.getOrDefault(emptyList())
                val shifts = shiftsResult.getOrDefault(emptyList())
                val appSettings = settingsResult.getOrNull()
                val reasons = reasonsResult.getOrDefault(emptyList())
                val activeBreakdowns = activeBreakdownsResult.getOrDefault(emptyList())
                val crates = cratesResult.getOrDefault(emptyList())

                val detectedShift = calculateCurrentShift(shifts)
                val supervisor = appSettings?.activeSupervisorName
                    ?: _uiState.value.currentUser?.fullName
                    ?: "Supervisor On Duty"

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        machines = machines,
                        products = products,
                        moulds = moulds,
                        operators = operators,
                        shiftSettings = shifts,
                        appSettings = appSettings,
                        currentShift = detectedShift,
                        activeSupervisor = supervisor,
                        breakdownReasons = reasons,
                        activeBreakdowns = activeBreakdowns,
                        crates = crates
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = "Failed to sync data: ${e.message}"
                    )
                }
            }
        }
    }

    fun selectMachine(machineId: String?) {
        _uiState.update { it.copy(selectedMachineId = machineId, materialVerificationResult = null) }
        if (machineId != null) {
            refreshCratesForMachine(machineId)
        }
    }

    private fun refreshCratesForMachine(machineId: String) {
        viewModelScope.launch {
            supabaseClient.getCrates(machineId = machineId, limit = 20).onSuccess { crates ->
                _uiState.update { it.copy(crates = crates) }
            }
        }
    }

    fun assignOperator(machineId: String, operatorId: String) {
        viewModelScope.launch {
            val result = supabaseClient.updateMachineStatus(
                machineId = machineId,
                status = "Running",
                operatorId = operatorId
            )
            if (result.isSuccess) {
                _uiState.update { state ->
                    val updated = state.machines.map {
                        if (it.id == machineId) it.copy(currentOperatorId = operatorId, status = "Running") else it
                    }
                    state.copy(machines = updated, successMessage = "Operator assigned successfully")
                }
            } else {
                _uiState.update { it.copy(error = result.exceptionOrNull()?.message) }
            }
        }
    }

    fun logBinCompleted(
        machineId: String,
        startupScrap: Int = 0,
        qcSample: Int = 0
    ) {
        viewModelScope.launch {
            val machine = _uiState.value.machines.find { it.id == machineId } ?: return@launch
            val product = _uiState.value.products.find { it.id == machine.currentProductId }
            val mould = _uiState.value.moulds.find { it.id == machine.currentMouldId }

            val binTargetQty = product?.binQty ?: 4000
            val gross = binTargetQty + startupScrap + qcSample
            val net = binTargetQty

            val nextBinNumber = (_uiState.value.crates.filter { it.machineId == machineId }.maxOfOrNull { it.binNumber } ?: 0) + 1
            val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.format(Date())

            val crate = Crate(
                id = UUID.randomUUID().toString(),
                batchId = product?.batchIdentifier ?: "BATCH-${System.currentTimeMillis() % 10000}",
                machineId = machineId,
                binNumber = nextBinNumber,
                startTime = timestamp,
                endTime = timestamp,
                grossQty = gross,
                startupScrap = startupScrap,
                qcSample = qcSample,
                netQty = net,
                operatorId = machine.currentOperatorId,
                supervisorId = _uiState.value.currentUser?.id,
                status = "Pending Inspection"
            )

            val result = supabaseClient.logCrate(crate)
            if (result.isSuccess) {
                _uiState.update { state ->
                    val updatedCrates = listOf(crate) + state.crates
                    state.copy(
                        crates = updatedCrates,
                        successMessage = "Bin #$nextBinNumber logged! ($net units)"
                    )
                }
            } else {
                _uiState.update { it.copy(error = result.exceptionOrNull()?.message ?: "Failed to log bin") }
            }
        }
    }

    fun reportBreakdown(machineId: String, reason: String, remarks: String?) {
        viewModelScope.launch {
            val machine = _uiState.value.machines.find { it.id == machineId }
            val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.format(Date())

            val record = BreakdownRecord(
                machineId = machineId,
                machineName = machine?.name ?: machineId,
                startTime = timestamp,
                reason = reason,
                remarks = remarks,
                operatorId = machine?.currentOperatorId,
                supervisorName = _uiState.value.activeSupervisor,
                status = "Open"
            )

            val result = supabaseClient.reportBreakdown(record)
            if (result.isSuccess) {
                refreshAll()
                _uiState.update { it.copy(successMessage = "Breakdown logged for ${machine?.name ?: machineId}") }
            } else {
                _uiState.update { it.copy(error = result.exceptionOrNull()?.message) }
            }
        }
    }

    fun resolveBreakdown(breakdownId: String, machineId: String) {
        viewModelScope.launch {
            val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.format(Date())

            val result = supabaseClient.resolveBreakdown(breakdownId, machineId, timestamp)
            if (result.isSuccess) {
                refreshAll()
                _uiState.update { it.copy(successMessage = "Breakdown resolved. Machine resumed.") }
            } else {
                _uiState.update { it.copy(error = result.exceptionOrNull()?.message) }
            }
        }
    }

    fun verifyMaterialBarcode(productId: String, barcode: String) {
        viewModelScope.launch {
            val result = supabaseClient.verifyMaterialBarcode(productId, barcode)
            result.fold(
                onSuccess = { isValid ->
                    _uiState.update {
                        it.copy(
                            materialVerificationResult = barcode to isValid,
                            successMessage = if (isValid) "Material Approved: $barcode" else null,
                            error = if (!isValid) "UNAPPROVED MATERIAL: $barcode" else null
                        )
                    }
                },
                onFailure = { err ->
                    _uiState.update { it.copy(error = "Verification failed: ${err.message}") }
                }
            )
        }
    }

    fun handoverShift(newSupervisorName: String) {
        viewModelScope.launch {
            val result = supabaseClient.handoverShift(newSupervisorName)
            if (result.isSuccess) {
                _uiState.update {
                    it.copy(
                        activeSupervisor = newSupervisorName,
                        successMessage = "Shift handover complete to $newSupervisorName"
                    )
                }
            } else {
                _uiState.update { it.copy(error = result.exceptionOrNull()?.message) }
            }
        }
    }

    private fun onBarcodeScanned(barcode: String) {
        val selectedMachine = _uiState.value.machines.find { it.id == _uiState.value.selectedMachineId }
        val productId = selectedMachine?.currentProductId
        if (productId != null) {
            verifyMaterialBarcode(productId, barcode)
        } else {
            _uiState.update { it.copy(successMessage = "Scanned: $barcode") }
        }
    }

    fun clearMessages() {
        _uiState.update { it.copy(error = null, successMessage = null) }
    }

    private fun calculateCurrentShift(shifts: List<ShiftSetting>): String {
        if (shifts.isEmpty()) return "Shift A"
        val cal = Calendar.getInstance()
        val currentMinutes = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)

        for (shift in shifts) {
            val startParts = shift.startTime.split(":")
            val endParts = shift.endTime.split(":")
            if (startParts.size >= 2 && endParts.size >= 2) {
                val startMin = startParts[0].toInt() * 60 + startParts[1].toInt()
                val endMin = endParts[0].toInt() * 60 + endParts[1].toInt()

                if (startMin <= endMin) {
                    if (currentMinutes in startMin until endMin) return "Shift ${shift.name}"
                } else {
                    // Spans midnight (e.g. 22:00 to 06:00)
                    if (currentMinutes >= startMin || currentMinutes < endMin) return "Shift ${shift.name}"
                }
            }
        }
        return "Shift A"
    }
}
