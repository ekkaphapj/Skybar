using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.IO;
using System.Data.OleDb;

namespace TheCottageSkyBar
{
    public partial class Form1 : Form
    {
        public static int shoptype = -1; // 0=sky bar, 1 = mini mart  
        public Form1()
        {
            InitializeComponent();
        }
        public static string connStringMain = @"Provider=Microsoft.Jet.OLEDB.4.0;Data Source=Skybar.mdb";
        public static string VoucherDBFile = "SkybarCoupon.mdb";
        public static bool isDBBackup = false;
        public static string VoucherUploadPath = @"G:\My Drive\SkyBar\Voucher";
        public static string DataBaseFilePath = @"G:\My Drive\Skybar\Database\Skybar.mdb";
        public static string DataBasePath = @"G:\My Drive\Skybar\Database";
        public static string VoucherconnStringMain = @"Provider=Microsoft.Jet.OLEDB.4.0;Data Source=" + VoucherDBFile;
        public static string VoucherDBPath = VoucherUploadPath + "\\" + VoucherDBFile;
        private void Form1_Load(object sender, EventArgs e)
        {
            timer1.Start();
            comboBox1.SelectedIndex = 0;

            if (File.Exists("Skybar.mdb"))
            {

                connStringMain = @"Provider=Microsoft.Jet.OLEDB.4.0;Data Source=Skybar.mdb";
                if (testConnection())
                {
                    MessageBox.Show("ใช้ฐานข้อมูลในเครื่อง");

                }
                else
                {
                    MessageBox.Show("ฐานข้อมูลผิดพลาด กรุณาปิดและเปิดใหม่");
                    this.Close();
                }
            }
            else if (File.Exists(@"z:\SkyBar.mdb"))
            {
                connStringMain = @"Provider=Microsoft.Jet.OLEDB.4.0;Data Source=z:\SkyBar.mdb";
                if (testConnection())
                {
                    MessageBox.Show("ใช้ฐานข้อมูลใน Network");
                }
                else
                {
                    MessageBox.Show("ฐานข้อมูลผิดพลาด กรุณาปิดและเปิดใหม่");
                    this.Close();
                }
                
            }
            else
            {
                MessageBox.Show("ไม่พบฐานข้อมูล");
                Application.Exit();
            }
            BackupData();
                
        }

        private bool testConnection()
        {
            OleDbConnection con = new OleDbConnection(connStringMain);
            try
            {
                con.Open();
                con.Close();
                return true;
            }
            catch (Exception)
            {

            }
            return false;

        }

        private void timer1_Tick(object sender, EventArgs e)
        {
            label2.Text = "วันที่ " + DateTime.Now.ToLongDateString() + " , " + DateTime.Now.ToLongTimeString();
        }
        private void button4_Click(object sender, EventArgs e)
        {
            if (isDBBackup == false)
            {
                DialogResult dialogResult = MessageBox.Show("ทำการสำรองข้อมูลแล้ว ใช่หรือไม่?", "สำรองข้อมูล", MessageBoxButtons.YesNo);
                if (dialogResult == DialogResult.Yes)
                {
                    if (isDBBackup==false)
                    {
                        DialogResult dialogResult2 = MessageBox.Show("แน่ใจว่าสำรองข้อมูลแล้ว?", "สำรองข้อมูล", MessageBoxButtons.YesNo);
                        if (dialogResult2 == DialogResult.Yes)
                        {
                            
                            Application.Exit();
                        }
                        else if (dialogResult2 == DialogResult.No)
                        {

                        }
                    }
                   
                }
                else if (dialogResult == DialogResult.No)
                {

                }
            }
            else
                Application.Exit();
           
        }

        Stock stockForm;
        private void button2_Click(object sender, EventArgs e)
        {
            try
            {
                stockForm.Dispose();
            }
            catch (Exception)
            {

            }
            stockForm = new Stock();
            stockForm.Show();

        }
        SellForm sellform;
        CusName cusnameForm;
        private void button1_Click(object sender, EventArgs e)
        {
            if (comboBox1.SelectedIndex == 0)
            {
                try
                {
                    cusnameForm.Dispose();
                }
                catch (Exception)
                {

                }
                cusnameForm = new CusName();
                cusnameForm.Show();
            }
            else
            {
                try
                {
                    sellform.Dispose();
                }
                catch(Exception)
                {

                }
                sellform = new SellForm("Mini Mart");
                sellform.Show();
            }
        }

        private void textBox1_KeyDown(object sender, KeyEventArgs e)
        {
           if (e.KeyCode == Keys.Enter)
            {
                MessageBox.Show("ok");
            }
        }

        AddItem additem;
        private void button5_Click(object sender, EventArgs e)
        {
            try
            {
                additem.Dispose();
            }
            catch (Exception)
            {

            }
            additem = new AddItem();
            additem.Show();
        }
        ReportForm reportform;
        private void button3_Click(object sender, EventArgs e)
        {
            try
            {
                reportform.Dispose();
            }
            catch (Exception)
            {

            }
            reportform = new ReportForm();
            reportform.Show();
           
        }

        public static double getTotalCash(string date)
        {
            double _totalcash = 0;
            string strSQL = "SELECT SUM(Amount) as Amount1 from CASH WHERE DATE1<=#"+date+"#";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
            {
                try {
                    _totalcash = Convert.ToDouble(reader["Amount1"].ToString());
                }
                catch (Exception)
                {

                }
            }

            reader.Close();
            connection.Close();
            return _totalcash;
        }

        private void comboBox1_SelectedIndexChanged(object sender, EventArgs e)
        {
            shoptype = Convert.ToInt16( comboBox1.SelectedIndex.ToString());
        }

        private void button6_Click(object sender, EventArgs e)
        {
            /*string d1 = DateTime.Now.AddDays(1).ToShortDateString() + " 23:00";
            MessageBox.Show(DateTime.Compare(DateTime.Now, Convert.ToDateTime(textBox1.Text)).ToString());*/
        }

        private void button6_Click_1(object sender, EventArgs e)
        {
            if (LoadVoucher())
            {
                MessageBox.Show("โหลดข้อมูล Voucher สำเร็จ");
                label4.Text = "โหลดเมื่อเวลา " + DateTime.Now.ToShortTimeString();
            }
            else
                label4.Text = "โหลดไม่สำเร็จ";

        }

        public static bool LoadVoucher()
        {
            if (File.Exists(VoucherDBPath))
            {
                try
                {
                    File.Copy(VoucherDBPath, VoucherDBFile, true);
                   
                    return true;
                    //label4.Text = "โหลดเมื่อเวลา " + DateTime.Now.ToShortTimeString();

                }
                catch (Exception)
                {
                    MessageBox.Show("ไม่สามารถโหลดข้อมูล Voucher ได้");
                    return false;
                }

            }
            return false;
        }

        public static string getDateTime(string date)
        {
            string dateNewFormat = Convert.ToDateTime(date).ToString("MM/dd/yyyy", System.Globalization.CultureInfo.InvariantCulture);
            return dateNewFormat;
        }

        VoucherForm vf;
        private void button7_Click(object sender, EventArgs e)
        {
            try
            {
                vf.Dispose();
            }
            catch(Exception)
            {

            }
            vf = new VoucherForm();
            vf.Show();
        }

        private void button8_Click(object sender, EventArgs e)
        {
            BackupData();
        }

        private void BackupData()
        {
            if (Directory.Exists(DataBasePath))
            {
                label5.Text = "กำลังดำเนินการ";
                try
                {
                    string _filename = DateTime.Now.Day.ToString() + "-" + DateTime.Now.Month.ToString() + "-" + DateTime.Now.Year.ToString()+"-"+DateTime.Now.Hour.ToString()+"-"+DateTime.Now.Minute.ToString();
                    string _DBPath = DataBasePath + @"\" + _filename+"\\";
                    Directory.CreateDirectory(_DBPath);
                    File.Copy("Skybar.mdb", DataBaseFilePath , true);
                    File.Copy("Skybar.mdb", _DBPath + "Skybar.mdb");
                    MessageBox.Show("ทำการสำรองข้อมูลเรียบร้อยแล้ว");
                    label5.Text = "สำรองข้อมูลแล้วเวลา " + DateTime.Now.ToShortTimeString();
                    isDBBackup = true;
                }
                catch (Exception)
                {
                    MessageBox.Show("สำรองข้อมูลไม่สำเร็จ กรุณาลองใหม่");
                }
            }
            else
                MessageBox.Show("ไม่สามารถสำรองข้อมูลได้ กรุณาลองใหม่ หรือเช็คสัญญาณอินเตอร์เน็ต");
        }

        private void button9_Click(object sender, EventArgs e)
        {
            DialogResult dialogResult = MessageBox.Show("ต้องการโหลดข้อมูลใหม่ ทับข้อมูลเดิมใช่หรือไม่", "โหลดข้อมูลใหม่", MessageBoxButtons.YesNo);
            if (dialogResult == DialogResult.Yes)
            {
                LoadDatabase();
            }
            else if (dialogResult == DialogResult.No)
            {

            }
        }

        private void LoadDatabase()
        {
            if (Directory.Exists(DataBasePath))
            {
                label5.Text = "กำลังดำเนินการ";
                try
                {
                    File.Copy(DataBaseFilePath, "Skybar.mdb", true);
                    label5.Text = "โหลดข้อมูลใหม่เรียบร้อยแล้วเวลา " + DateTime.Now.ToShortTimeString();
                    MessageBox.Show("โหลดข้อมูลใหม่เรียบร้อย");
                }
                catch (Exception)
                {
                    MessageBox.Show("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่");
                }
            }
            else
                MessageBox.Show("โหลดข้อมูลไม่สำเร็จ");
        }

    }
}
