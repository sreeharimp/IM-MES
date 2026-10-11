package com.im.shopfloor.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Profile(
    val id: String,
    val email: String,
    @SerialName("full_name") val fullName: String,
    val role: String,
    @SerialName("employee_code") val employeeCode: String? = null,
    @SerialName("is_active") val isActive: Boolean = true
)

@Serializable
data class Machine(
    val id: String,
    val name: String,
    val model: String? = null,
    val status: String = "Idle", // Running, Idle, Maintenance, Off
    @SerialName("current_product_id") val currentProductId: String? = null,
    @SerialName("current_mould_id") val currentMouldId: String? = null,
    @SerialName("current_operator_id") val currentOperatorId: String? = null,
    @SerialName("bin_start_time") val binStartTime: Long? = null,
    @SerialName("bin_target") val binTarget: Int? = 1000,
    @SerialName("last_cleaning_done") val lastCleaningDone: Boolean? = null,
    @SerialName("fai_approved") val faiApproved: Boolean? = null
)

@Serializable
data class Product(
    val id: String,
    val name: String,
    @SerialName("mould_id") val mouldId: String? = null,
    @SerialName("item_code") val itemCode: String? = null,
    @SerialName("batch_identifier") val batchIdentifier: String? = null,
    @SerialName("bin_qty") val binQty: Int = 4000,
    @SerialName("std_pack_size") val stdPackSize: Int = 1000
)

@Serializable
data class Mould(
    val id: String,
    val name: String,
    val cavities: Int = 4,
    @SerialName("cycle_time") val cycleTime: Int = 20
)

@Serializable
data class Operator(
    val id: String,
    val name: String,
    @SerialName("employee_id") val employeeId: String? = null,
    @SerialName("is_certified") val isCertified: Boolean = true
)

@Serializable
data class ShiftSetting(
    val id: String, // 'A', 'B', 'C'
    val name: String,
    @SerialName("start_time") val startTime: String, // '06:00'
    @SerialName("end_time") val endTime: String     // '14:00'
)

@Serializable
data class AppSettings(
    val id: String,
    @SerialName("current_shift") val currentShift: String? = null,
    @SerialName("active_supervisor_name") val activeSupervisorName: String? = null,
    @SerialName("pending_handover") val pendingHandover: Boolean = false
)

@Serializable
data class Crate(
    val id: String,
    @SerialName("batch_id") val batchId: String? = null,
    @SerialName("machine_id") val machineId: String,
    @SerialName("bin_number") val binNumber: Int,
    @SerialName("start_time") val startTime: String? = null,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("gross_qty") val grossQty: Int,
    @SerialName("startup_scrap") val startupScrap: Int = 0,
    @SerialName("qc_sample") val qcSample: Int = 0,
    @SerialName("net_qty") val netQty: Int,
    @SerialName("rejected_qty") val rejectedQty: Int = 0,
    @SerialName("operator_id") val operatorId: String? = null,
    @SerialName("supervisor_id") val supervisorId: String? = null,
    val status: String = "Pending Inspection"
)

@Serializable
data class BreakdownReason(
    val id: String,
    val name: String
)

@Serializable
data class BreakdownRecord(
    val id: String? = null,
    @SerialName("machine_id") val machineId: String,
    @SerialName("machine_name") val machineName: String? = null,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("duration_minutes") val durationMinutes: Int? = null,
    val reason: String,
    val remarks: String? = null,
    @SerialName("operator_id") val operatorId: String? = null,
    @SerialName("supervisor_name") val supervisorName: String? = null,
    val status: String = "Open"
)

@Serializable
data class ApprovedMaterial(
    val id: String? = null,
    @SerialName("product_id") val productId: String,
    @SerialName("material_id") val materialId: String,
    val vendor: String? = null
)
