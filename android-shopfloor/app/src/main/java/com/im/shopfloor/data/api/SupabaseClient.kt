package com.im.shopfloor.data.api

import com.im.shopfloor.data.local.SessionManager
import com.im.shopfloor.data.model.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.android.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.logging.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

class SupabaseClient(
    private val sessionManager: SessionManager,
    private val baseUrl: String = "https://eelyuahpkpiwobchtuxv.supabase.co",
    private val anonKey: String = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlbHl1YWhwa3Bpd29iY2h0dXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTA5MjksImV4cCI6MjA5MDI4NjkyOX0.C5aR4VUx2bo0cgocuaDCNZiVdtvcRJk6UnDFdcj1-LA"
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val httpClient = HttpClient(Android) {
        install(ContentNegotiation) {
            json(json)
        }
        install(Logging) {
            level = LogLevel.INFO
        }
    }

    @Serializable
    private data class AuthRequest(val email: String, val password: String)

    @Serializable
    private data class AuthResponse(
        @kotlinx.serialization.SerialName("access_token") val accessToken: String,
        @kotlinx.serialization.SerialName("token_type") val tokenType: String,
        val user: AuthUser
    )

    @Serializable
    private data class AuthUser(
        val id: String,
        val email: String
    )

    suspend fun signIn(email: String, password: String): Result<Profile> {
        return try {
            val response: HttpResponse = httpClient.post("$baseUrl/auth/v1/token?grant_type=password") {
                contentType(ContentType.Application.Json)
                header("apikey", anonKey)
                setBody(AuthRequest(email, password))
            }

            if (!response.status.isSuccess()) {
                val err = response.bodyAsText()
                return Result.failure(Exception("Login failed (${response.status.value}): $err"))
            }

            val authData: AuthResponse = response.body()
            sessionManager.accessToken = authData.accessToken

            // Fetch profile for user
            val profile = fetchProfile(authData.user.id)
                ?: Profile(
                    id = authData.user.id,
                    email = authData.user.email,
                    fullName = email.substringBefore("@").replace(".", " ").replaceFirstChar { if (it.isLowerCase()) it.titlecase(java.util.Locale.ROOT) else it.toString() },
                    role = "operator"
                )

            sessionManager.saveProfile(profile)
            Result.success(profile)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun fetchProfile(userId: String): Profile? {
        return try {
            val response: List<Profile> = httpClient.get("$baseUrl/rest/v1/profiles") {
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("id", "eq.$userId")
                parameter("select", "*")
            }.body()
            response.firstOrNull()
        } catch (e: Exception) {
            null
        }
    }

    suspend fun getMachines(): Result<List<Machine>> {
        return try {
            val response: List<Machine> = httpClient.get("$baseUrl/rest/v1/machines") {
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("select", "*")
                parameter("order", "name.asc")
            }.body()
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getProducts(): Result<List<Product>> {
        return try {
            val response: List<Product> = httpClient.get("$baseUrl/rest/v1/products") {
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("select", "*")
            }.body()
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getMoulds(): Result<List<Mould>> {
        return try {
            val response: List<Mould> = httpClient.get("$baseUrl/rest/v1/moulds") {
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("select", "*")
            }.body()
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getOperators(): Result<List<Operator>> {
        return try {
            val response: List<Operator> = httpClient.get("$baseUrl/rest/v1/operators") {
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("select", "*")
                parameter("order", "name.asc")
            }.body()
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getShiftSettings(): Result<List<ShiftSetting>> {
        return try {
            val response: List<ShiftSetting> = httpClient.get("$baseUrl/rest/v1/shift_settings") {
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("select", "*")
            }.body()
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getAppSettings(): Result<AppSettings?> {
        return try {
            val response: List<AppSettings> = httpClient.get("$baseUrl/rest/v1/app_settings") {
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("select", "*")
                parameter("limit", "1")
            }.body()
            Result.success(response.firstOrNull())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getCrates(machineId: String? = null, limit: Int = 20): Result<List<Crate>> {
        return try {
            val response: List<Crate> = httpClient.get("$baseUrl/rest/v1/crates") {
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("select", "*")
                if (machineId != null) {
                    parameter("machine_id", "eq.$machineId")
                }
                parameter("order", "created_at.desc")
                parameter("limit", limit.toString())
            }.body()
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun logCrate(crate: Crate): Result<Unit> {
        return try {
            val response: HttpResponse = httpClient.post("$baseUrl/rest/v1/crates") {
                contentType(ContentType.Application.Json)
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                header("Prefer", "return=minimal")
                setBody(crate)
            }
            if (response.status.isSuccess()) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to save crate: ${response.bodyAsText()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getBreakdownReasons(): Result<List<BreakdownReason>> {
        return try {
            val response: List<BreakdownReason> = httpClient.get("$baseUrl/rest/v1/breakdown_reasons") {
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("select", "*")
            }.body()
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getActiveBreakdowns(): Result<List<BreakdownRecord>> {
        return try {
            val response: List<BreakdownRecord> = httpClient.get("$baseUrl/rest/v1/breakdown_records") {
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("select", "*")
                parameter("status", "eq.Open")
            }.body()
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun reportBreakdown(record: BreakdownRecord): Result<Unit> {
        return try {
            val response: HttpResponse = httpClient.post("$baseUrl/rest/v1/breakdown_records") {
                contentType(ContentType.Application.Json)
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                header("Prefer", "return=minimal")
                setBody(record)
            }
            if (response.status.isSuccess()) {
                // Also update machine status to 'Maintenance'
                updateMachineStatus(record.machineId, "Maintenance")
                Result.success(Unit)
            } else {
                Result.failure(Exception("Breakdown report failed: ${response.bodyAsText()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun resolveBreakdown(breakdownId: String, machineId: String, endTime: String): Result<Unit> {
        return try {
            val updatePayload = mapOf(
                "end_time" to endTime,
                "status" to "Resolved"
            )
            val response: HttpResponse = httpClient.patch("$baseUrl/rest/v1/breakdown_records") {
                contentType(ContentType.Application.Json)
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("id", "eq.$breakdownId")
                setBody(updatePayload)
            }
            if (response.status.isSuccess()) {
                // Resume machine to Running or Idle
                updateMachineStatus(machineId, "Running")
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to resolve breakdown: ${response.bodyAsText()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateMachineStatus(
        machineId: String,
        status: String,
        operatorId: String? = null,
        productId: String? = null
    ): Result<Unit> {
        return try {
            val payload = mutableMapOf<String, String>()
            payload["status"] = status
            if (operatorId != null) payload["current_operator_id"] = operatorId
            if (productId != null) payload["current_product_id"] = productId

            val response: HttpResponse = httpClient.patch("$baseUrl/rest/v1/machines") {
                contentType(ContentType.Application.Json)
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("id", "eq.$machineId")
                setBody(payload)
            }
            if (response.status.isSuccess()) Result.success(Unit)
            else Result.failure(Exception("Update machine status failed: ${response.bodyAsText()}"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun verifyMaterialBarcode(productId: String, scannedBarcode: String): Result<Boolean> {
        return try {
            val response: List<ApprovedMaterial> = httpClient.get("$baseUrl/rest/v1/approved_materials") {
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                parameter("product_id", "eq.$productId")
                parameter("material_id", "eq.$scannedBarcode")
            }.body()
            Result.success(response.isNotEmpty())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun handoverShift(newSupervisorName: String): Result<Unit> {
        return try {
            val payload = mapOf(
                "active_supervisor_name" to newSupervisorName,
                "pending_handover" to "false"
            )
            val response: HttpResponse = httpClient.patch("$baseUrl/rest/v1/app_settings") {
                contentType(ContentType.Application.Json)
                header("apikey", anonKey)
                header("Authorization", "Bearer ${sessionManager.accessToken ?: anonKey}")
                setBody(payload)
            }
            if (response.status.isSuccess()) Result.success(Unit)
            else Result.failure(Exception("Shift handover failed: ${response.bodyAsText()}"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
